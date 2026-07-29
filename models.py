from sqlalchemy import Column, Integer, String, DateTime, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import zoneinfo

def get_ist_time():
    return datetime.now(zoneinfo.ZoneInfo("Asia/Kolkata"))

Base = declarative_base()

class Student(Base):
    __tablename__ = "students"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    encoding_file = Column(String)  # Local path fallback
    cloud_url = Column(String, nullable=True)  # Cloudinary URL

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer)
    name = Column(String)
    timestamp = Column(DateTime, default=get_ist_time)

engine = create_engine("sqlite:///./attendance.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

# Auto-migration for SQLite to ensure cloud_url column exists
try:
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "students" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("students")]
            if "cloud_url" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN cloud_url VARCHAR"))
                conn.commit()
except Exception as e:
    print(f"Migration notice: {e}", flush=True)
