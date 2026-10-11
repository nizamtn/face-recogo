from sqlalchemy import Column, Integer, String, DateTime, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_time():
    return datetime.now(IST)

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
    period = Column(String, default="Period 1")
    subject = Column(String, default="General")
    faculty = Column(String, default="Faculty")
    date = Column(String)
    timestamp = Column(DateTime, default=get_ist_time)

engine = create_engine("sqlite:///./attendance.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

# Auto-migration for SQLite to ensure all required columns exist
try:
    with engine.connect() as conn:
        inspector = inspect(engine)
        # Migrate students table
        if "students" in inspector.get_table_names():
            student_cols = [c["name"] for c in inspector.get_columns("students")]
            if "cloud_url" not in student_cols:
                conn.execute(text("ALTER TABLE students ADD COLUMN cloud_url VARCHAR"))
                conn.commit()
                
        # Migrate attendance table
        if "attendance" in inspector.get_table_names():
            att_cols = [c["name"] for c in inspector.get_columns("attendance")]
            for col_name in ["period", "subject", "faculty", "date"]:
                if col_name not in att_cols:
                    conn.execute(text(f"ALTER TABLE attendance ADD COLUMN {col_name} VARCHAR"))
                    conn.commit()
except Exception as e:
    print(f"Migration notice: {e}", flush=True)
