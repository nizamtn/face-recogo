import os
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Depends, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import datetime
import zoneinfo
import cloudinary
import cloudinary.uploader

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

def train_model(db: Session):
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    faces = []
    ids = []
    
    students = db.query(Student).all()
    for s in students:
        if s.encoding_file and os.path.exists(s.encoding_file):
            img = cv2.imread(s.encoding_file, cv2.IMREAD_GRAYSCALE)
            if img is not None:
                faces.append(img)
                ids.append(s.id)
                
    if len(faces) > 0:
        recognizer.train(faces, np.array(ids))
        model_path = os.path.join("data", "models", "Trainner.yml")
        recognizer.save(model_path)
        return True
    return False

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
    
    new_student = Student(name=name, encoding_file="")
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    
    file_name = f"{new_student.id}_{name.replace(' ', '_')}.jpg"
    face_path = os.path.join("data", "faces", file_name)
    os.makedirs(os.path.dirname(face_path), exist_ok=True)
    cv2.imwrite(face_path, face_img)
    
    new_student.encoding_file = face_path
    db.commit()
    
    # Upload to Cloudinary
    cloud_url = ""
    try:
        result = cloudinary.uploader.upload(
            face_path,
            folder="face_attendance/faces",
            public_id=file_name.replace('.jpg', ''),
            overwrite=True
        )
        cloud_url = result.get("secure_url", "")
        print(f"Successfully uploaded to Cloudinary: {cloud_url}", flush=True)
    except Exception as e:
        print(f"Failed to upload to Cloudinary: {e}", flush=True)
    
    # Re-train model after registration
    train_model(db)
    
    return {"message": f"Student '{name}' registered & uploaded to Cloudinary!", "success": True, "cloud_url": cloud_url}

@app.post("/attendance")
async def take_attendance(file: UploadFile = File(...), db: Session = Depends(get_db)):
    model_path = os.path.join("data", "models", "Trainner.yml")
    if not os.path.isfile(model_path):
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
    
    if conf < 70:
        student = db.query(Student).filter(Student.id == serial).first()
        if student:
            today = get_ist_time().date()
            existing = db.query(Attendance).filter(Attendance.student_id == student.id).all()
            already_logged = any(att.timestamp.date() == today for att in existing)
            
            if not already_logged:
                att = Attendance(student_id=student.id, name=student.name, timestamp=get_ist_time())
                db.add(att)
                db.commit()
                return {"message": f"Attendance logged for {student.name}", "success": True}
            else:
                return {"message": f"{student.name} already logged attendance today", "success": True}
    
    return {"error": "Face not recognized"}

@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    records = db.query(Attendance).order_by(Attendance.timestamp.desc()).all()
    return [{"id": r.id, "name": r.name, "time": r.timestamp.strftime("%Y-%m-%d %H:%M:%S")} for r in records]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
