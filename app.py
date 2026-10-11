import os
import cv2
import numpy as np
import urllib.request
from fastapi import FastAPI, File, UploadFile, Depends, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
import cloudinary
import cloudinary.uploader
import cloudinary.api

from models import SessionLocal, Student, Attendance
from timetable import get_current_period_info, get_ist_now, SUBJECTS, TIMETABLE

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.makedirs(os.path.join(BASE_DIR, "static"), exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
os.makedirs(os.path.join(BASE_DIR, "data", "faces"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "data", "models"), exist_ok=True)

# Initialize Cloudinary
cloudinary.config(
    cloud_name="kfls4shj",
    api_key="933967963921657",
    api_secret="AGTraI2uE2ucnmyC9dtQF6pZmlI",
    secure=True
)
print("Cloudinary initialized successfully.", flush=True)

harcascadePath = os.path.join(BASE_DIR, "haarcascade_frontalface_default.xml")
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
                from models import engine
                engine.dispose()
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
            public_id = r["public_id"]
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
        if s.encoding_file and os.path.exists(s.encoding_file):
            img = cv2.imread(s.encoding_file, cv2.IMREAD_GRAYSCALE)
            
        if img is None and s.cloud_url:
            img = fetch_image_from_url(s.cloud_url)
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

import threading

def initialize_background_sync():
    """Sync database, photos from Cloudinary, and train face model in background."""
    try:
        db = SessionLocal()
        try:
            if db.query(Student).count() == 0:
                restore_db_from_cloud()
            sync_students_from_cloudinary(db)
            train_model(db)
            backup_db_to_cloud()
        finally:
            db.close()
    except Exception as e:
        print(f"Background cloud sync notice: {e}", flush=True)

@app.on_event("startup")
def startup_event():
    # Start sync in a daemon thread so the web server boots immediately and never times out on Render
    threading.Thread(target=initialize_background_sync, daemon=True).start()

@app.get("/", response_class=HTMLResponse)
def read_root():
    index_path = os.path.join(BASE_DIR, "static", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/current-period")
def get_current_period():
    """Returns the live active period and timetable information."""
    return get_current_period_info()

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
    
    max_id = db.query(func.max(Student.id)).scalar() or 0
    new_id = max_id + 1
    
    file_name = f"{new_id}_{name.replace(' ', '_')}.jpg"
    face_path = os.path.join("data", "faces", file_name)
    os.makedirs(os.path.dirname(face_path), exist_ok=True)
    cv2.imwrite(face_path, face_img)
    
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
    
    train_model(db)
    backup_db_to_cloud()
    
    return {"message": f"Student '{name}' registered & synced with Cloudinary!", "success": True, "cloud_url": cloud_url}

@app.post("/attendance")
async def take_attendance(
    file: UploadFile = File(...),
    selected_period: str = Form(None),
    db: Session = Depends(get_db)
):
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
    print(f"Recognized face ID={serial} with confidence={conf}", flush=True)
    
    if conf < 75:
        student = db.query(Student).filter(Student.id == serial).first()
        if student:
            # Determine period, subject, faculty from timetable
            current_info = get_current_period_info()
            day_name = get_ist_now().strftime("%A")
            today_str = get_ist_now().strftime("%Y-%m-%d")
            
            if selected_period and selected_period != "auto":
                target_period = selected_period
            else:
                target_period = current_info.get("period", "Period 1")
                # If during break or off-hours, fallback to clean period name
                if "Break" in target_period or "Upcoming" in target_period or "Off" in target_period:
                    target_period = "Period 1"
                    
            day_schedule = TIMETABLE.get(day_name, {})
            sub_code = day_schedule.get(target_period, "General")
            sub_info = SUBJECTS.get(sub_code, {"name": sub_code, "faculty": "Faculty Incharge", "code": ""})
            subject_display = f"{sub_code} - {sub_info['name']}"
            faculty_display = sub_info["faculty"]
            
            # Check if student already marked for THIS specific period on THIS date
            existing = db.query(Attendance).filter(
                Attendance.student_id == student.id,
                Attendance.period == target_period,
                Attendance.date == today_str
            ).first()
            
            if existing:
                return {
                    "message": f"{student.name} is ALREADY marked present for {target_period} ({sub_code}) today!",
                    "success": True,
                    "already_marked": True,
                    "period": target_period,
                    "subject": subject_display
                }
            
            att = Attendance(
                student_id=student.id,
                name=student.name,
                period=target_period,
                subject=subject_display,
                faculty=faculty_display,
                date=today_str,
                timestamp=get_ist_now()
            )
            db.add(att)
            db.commit()
            backup_db_to_cloud()
            
            return {
                "message": f"Present marked for {student.name} in {target_period} ({sub_code})!",
                "success": True,
                "period": target_period,
                "subject": subject_display,
                "faculty": faculty_display
            }
    
    return {"error": "Face not recognized. Please face the camera directly in good lighting."}

@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    records = db.query(Attendance).order_by(Attendance.timestamp.desc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "subject": r.subject or "General",
            "period": r.period or "Period 1",
            "faculty": r.faculty or "Faculty",
            "date": r.date or (r.timestamp.strftime("%Y-%m-%d") if r.timestamp else "-"),
            "time": r.timestamp.strftime("%I:%M:%S %p") if r.timestamp else "-"
        }
        for r in records
    ]

@app.post("/api/faculty/login")
async def faculty_login(username: str = Form(...), password: str = Form(...)):
    valid_users = ["hod", "teacher", "admin"]
    faculty_pass = os.environ.get("FACULTY_PASSWORD", "admin123")
    
    if username.strip().lower() in valid_users and password.strip() == faculty_pass:
        return {
            "success": True,
            "message": "Login successful",
            "user": username.strip().lower(),
            "role": "HOD / Faculty"
        }
    return {"success": False, "error": "Invalid username or password"}

@app.get("/api/faculty/report")
def get_faculty_report(date: str = None, period: str = "Period 1", db: Session = Depends(get_db)):
    if not date:
        date = get_ist_now().strftime("%Y-%m-%d")
        
    all_students = db.query(Student).order_by(Student.name.asc()).all()
    total_students_count = len(all_students)
    
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        day_name = dt.strftime("%A")
    except Exception:
        dt = get_ist_now()
        day_name = dt.strftime("%A")
        
    day_schedule = TIMETABLE.get(day_name, {})
    sub_code = day_schedule.get(period, "General")
    sub_info = SUBJECTS.get(sub_code, {"name": sub_code, "faculty": "Faculty Incharge", "code": ""})
    subject_display = f"{sub_code} - {sub_info['name']}"
    faculty_display = sub_info["faculty"]
    
    period_records = db.query(Attendance).filter(
        Attendance.date == date,
        Attendance.period == period
    ).all()
    
    present_map = {r.student_id: r for r in period_records}
    
    present_students = [
        {
            "id": s.id,
            "name": s.name,
            "time": present_map[s.id].timestamp.strftime("%I:%M %p") if present_map[s.id].timestamp else "-"
        }
        for s in all_students if s.id in present_map
    ]
    
    absent_students = [
        {
            "id": s.id,
            "name": s.name
        }
        for s in all_students if s.id not in present_map
    ]
    
    day_records = db.query(Attendance).filter(Attendance.date == date).all()
    student_attended_periods = {}
    for r in day_records:
        if r.student_id not in student_attended_periods:
            student_attended_periods[r.student_id] = set()
        student_attended_periods[r.student_id].add(r.period)
        
    conducted_periods = set(r.period for r in day_records if r.period.startswith("Period"))
    scheduled_periods = [f"Period {i}" for i in range(1, 8)]
    required_periods = conducted_periods if len(conducted_periods) > 0 else set(scheduled_periods)
    
    full_day_students = [
        {
            "id": s.id,
            "name": s.name,
            "periods_attended": len(student_attended_periods.get(s.id, set()))
        }
        for s in all_students
        if len(student_attended_periods.get(s.id, set())) >= len(required_periods) and len(required_periods) > 0
    ]
    
    return {
        "date": date,
        "day": day_name,
        "period": period,
        "subject": subject_display,
        "faculty": faculty_display,
        "total_enrolled": total_students_count,
        "present_count": len(present_students),
        "absent_count": len(absent_students),
        "full_day_count": len(full_day_students),
        "conducted_periods_count": len(conducted_periods),
        "absent_students": absent_students,
        "present_students": present_students,
        "full_day_students": full_day_students
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
