import os
import cv2
import numpy as np
import urllib.request
from fastapi import FastAPI, File, UploadFile, Depends, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import zoneinfo
import cloudinary
import cloudinary.uploader
import cloudinary.api

def get_ist_time():
    return datetime.now(zoneinfo.ZoneInfo("Asia/Kolkata"))

from models import SessionLocal, Student, Attendance

app = FastAPI()

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
os.makedirs(os.path.join("data", "faces"), exist_ok=True)
os.makedirs(os.path.join("data", "models"), exist_ok=True)

# Initialize Cloudinary
cloudinary.config(
    cloud_name="kfls4shj",
    api_key="933967963921657",
    api_secret="AGTraI2uE2ucnmyC9dtQF6pZmlI",
    secure=True
)
print("Cloudinary initialized successfully.", flush=True)

harcascadePath = "haarcascade_frontalface_default.xml"
faceCascade = cv2.CascadeClassifier(harcascadePath)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def fetch_image_from_url(url):
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            arr = np.asarray(bytearray(resp.read()), dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
            return img
    except Exception as e:
        print(f"Error fetching image from Cloudinary ({url}): {e}", flush=True)
        return None

def backup_db_to_cloud():
    """Back up SQLite database to Cloudinary so records persist across restarts."""
    try:
        if os.path.exists("attendance.db"):
            cloudinary.uploader.upload(
                "attendance.db",
                resource_type="raw",
                public_id="face_attendance/db/attendance.db",
                overwrite=True
            )
            print("Successfully backed up attendance.db to Cloudinary.", flush=True)
    except Exception as e:
        print(f"Failed to backup attendance.db to Cloudinary: {e}", flush=True)

def restore_db_from_cloud():
    """Restore SQLite database from Cloudinary if local database is missing or empty."""
    try:
        url = cloudinary.utils.cloudinary_url("face_attendance/db/attendance.db", resource_type="raw")[0]
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            if len(data) > 0:
                with open("attendance.db", "wb") as f:
                    f.write(data)
                print("Restored attendance.db from Cloudinary cloud backup!", flush=True)
                return True
    except Exception as e:
        print(f"Notice: No cloud database backup found or error restoring: {e}", flush=True)
    return False

def sync_students_from_cloudinary(db: Session):
    """Self-healing: Reconstruct registered students from Cloudinary images if DB was wiped."""
    try:
        res = cloudinary.api.resources(type="upload", prefix="face_attendance/faces", max_results=100)
        resources = res.get("resources", [])
        existing_students = {s.name.lower(): s for s in db.query(Student).all()}
        
        for r in resources:
            public_id = r["public_id"]  # e.g. "face_attendance/faces/1_Nizam"
            file_name = public_id.split("/")[-1]
            if file_name in ["test_upload", "verification_test"]:
                continue
            
            parts = file_name.split("_", 1)
            raw_name = parts[1].replace("_", " ") if len(parts) == 2 else file_name
            cloud_url = r["secure_url"]
            
            if raw_name.lower() not in existing_students:
                max_id = db.query(func.max(Student.id)).scalar() or 0
                new_id = max_id + 1
                local_path = os.path.join("data", "faces", f"{new_id}_{raw_name.replace(' ', '_')}.jpg")
                new_student = Student(id=new_id, name=raw_name, encoding_file=local_path, cloud_url=cloud_url)
                db.add(new_student)
                db.commit()
                existing_students[raw_name.lower()] = new_student
                print(f"Auto-synced student from Cloudinary: ID={new_id}, Name={raw_name}", flush=True)
    except Exception as e:
        print(f"Notice: Could not sync students from Cloudinary API: {e}", flush=True)

def train_model(db: Session):
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    faces = []
    ids = []
    
    students = db.query(Student).all()
    for s in students:
        img = None
        # 1. Try reading local face file
        if s.encoding_file and os.path.exists(s.encoding_file):
            img = cv2.imread(s.encoding_file, cv2.IMREAD_GRAYSCALE)
            
        # 2. Fallback to Cloudinary if local file missing (e.g. cloud host restart)
        if img is None and s.cloud_url:
            img = fetch_image_from_url(s.cloud_url)
            # Save downloaded image locally for caching
            if img is not None and s.encoding_file:
                os.makedirs(os.path.dirname(s.encoding_file), exist_ok=True)
                cv2.imwrite(s.encoding_file, img)
                
        if img is not None:
            faces.append(img)
            ids.append(s.id)
                
    if len(faces) > 0:
        recognizer.train(faces, np.array(ids))
        model_path = os.path.join("data", "models", "Trainner.yml")
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        recognizer.save(model_path)
        print(f"Model successfully trained with {len(faces)} student face(s).", flush=True)
        return True
    else:
        print("No student faces available to train model.", flush=True)
        return False

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # 1. Check if DB needs to be restored from Cloudinary
        if db.query(Student).count() == 0:
            restored = restore_db_from_cloud()
            if restored:
                # Re-bind session to updated DB file
                db.close()
                db = SessionLocal()
        
        # 2. Reconstruct any missing students directly from Cloudinary face storage
        sync_students_from_cloudinary(db)
        
        # 3. Train model using all available student faces
        train_model(db)
        
        # 4. Save DB backup to Cloudinary
        backup_db_to_cloud()
    finally:
        db.close()

@app.get("/", response_class=HTMLResponse)
def read_root():
    with open("static/index.html", "r") as f:
        return f.read()

@app.post("/register")
async def register_student(name: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    faces = faceCascade.detectMultiScale(gray, 1.3, 5)
    if len(faces) == 0:
        return {"error": "No face found in image. Please try again in better lighting."}
    
    (x, y, w, h) = faces[0]
    face_img = gray[y:y+h, x:x+w]
    
    # Generate unique ID
    max_id = db.query(func.max(Student.id)).scalar() or 0
    new_id = max_id + 1
    
    file_name = f"{new_id}_{name.replace(' ', '_')}.jpg"
    face_path = os.path.join("data", "faces", file_name)
    os.makedirs(os.path.dirname(face_path), exist_ok=True)
    cv2.imwrite(face_path, face_img)
    
    # Upload face image to Cloudinary
    cloud_url = ""
    try:
        result = cloudinary.uploader.upload(
            face_path,
            folder="face_attendance/faces",
            public_id=f"{new_id}_{name.replace(' ', '_')}",
            overwrite=True
        )
        cloud_url = result.get("secure_url", "")
        print(f"Successfully uploaded to Cloudinary: {cloud_url}", flush=True)
    except Exception as e:
        print(f"Failed to upload to Cloudinary: {e}", flush=True)
    
    new_student = Student(id=new_id, name=name, encoding_file=face_path, cloud_url=cloud_url)
    db.add(new_student)
    db.commit()
    
    # Re-train model and back up database to Cloudinary
    train_model(db)
    backup_db_to_cloud()
    
    return {"message": f"Student '{name}' registered & synced with Cloudinary!", "success": True, "cloud_url": cloud_url}

@app.post("/attendance")
async def take_attendance(file: UploadFile = File(...), db: Session = Depends(get_db)):
    model_path = os.path.join("data", "models", "Trainner.yml")
    if not os.path.isfile(model_path):
        trained = train_model(db)
        if not trained or not os.path.isfile(model_path):
            return {"error": "No model trained. Please register a student first."}
        
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read(model_path)
    
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    faces = faceCascade.detectMultiScale(gray, 1.2, 5)
    if len(faces) == 0:
        return {"error": "No face found in image. Please try again."}
        
    (x, y, w, h) = faces[0]
    face_img = gray[y:y+h, x:x+w]
    
    serial, conf = recognizer.predict(face_img)
    print(f"Recognized face ID={serial} with confidence/distance={conf}", flush=True)
    
    if conf < 75:
        student = db.query(Student).filter(Student.id == serial).first()
        if student:
            today = get_ist_time().date()
            existing = db.query(Attendance).filter(Attendance.student_id == student.id).all()
            already_logged = any(att.timestamp.date() == today for att in existing)
            
            if not already_logged:
                att = Attendance(student_id=student.id, name=student.name, timestamp=get_ist_time())
                db.add(att)
                db.commit()
                backup_db_to_cloud()
                return {"message": f"Attendance logged for {student.name}", "success": True}
            else:
                return {"message": f"{student.name} already logged attendance today", "success": True}
    
    return {"error": "Face not recognized. Please make sure you are registered and facing the camera directly."}

@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    records = db.query(Attendance).order_by(Attendance.timestamp.desc()).all()
    return [{"id": r.id, "name": r.name, "time": r.timestamp.strftime("%Y-%m-%d %H:%M:%S")} for r in records]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
