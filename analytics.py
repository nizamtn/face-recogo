"""
Predictive Analytics for Student Dropout Risk
A Micro Project for PBADT304 - Introduction to Data Science
Royal College of Engineering and Technology, Akkikavu
Submitted By Group No: 3 (Rinsha P.A, Salwa Saleem, Rana Afrin, Muhamed Nizam T.N)
Dataset: college_student_management_data.csv (1,545 records)
"""

import os
import csv
import math

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "college_student_management_data.csv")

# Cached dataset in memory
_CACHED_DATASET = None

def load_raw_dataset():
    """Loads college_student_management_data.csv cleanly."""
    global _CACHED_DATASET
    if _CACHED_DATASET is not None:
        return _CACHED_DATASET

    rows = []
    if os.path.exists(CSV_PATH):
        try:
            with open(CSV_PATH, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    rows.append(r)
        except Exception as e:
            print(f"Error reading {CSV_PATH}: {e}", flush=True)

    _CACHED_DATASET = rows
    return _CACHED_DATASET

def calculate_student_risk(data):
    """
    Computes Dropout Risk Index using the Micro Project Proposal weighted formula:
    Risk Score = 0.35 * Academic Deficit + 0.35 * Attendance Deficit + 0.15 * Engagement Deficit + 0.15 * Administrative Deficit
    """
    try:
        gpa = float(data.get("gpa") or data.get("GPA") or 3.0)
    except Exception:
        gpa = 3.0

    try:
        att = float(data.get("attendance") or data.get("attendance_rate") or 0.8)
        if att > 1.0: # if passed as percentage (e.g. 80.0)
            att = att / 100.0
    except Exception:
        att = 0.8

    try:
        grade = float(data.get("avg_course_grade") or 75.0)
    except Exception:
        grade = 75.0

    try:
        logins = float(data.get("lms_logins") or data.get("lms_logins_past_month") or data.get("portalLogins") or 20.0)
    except Exception:
        logins = 20.0

    try:
        assign = float(data.get("assignments") or data.get("assignment_submission_rate") or 0.8)
        if assign > 1.0:
            assign = assign / 100.0
    except Exception:
        assign = 0.8

    try:
        video = float(data.get("video_completion_rate") or 0.75)
        if video > 1.0:
            video = video / 100.0
    except Exception:
        video = 0.75

    status = str(data.get("enrollment_status") or "Active").strip()
    load = int(data.get("course_load") or 4)

    # 1. Academic Deficit (Scale: 0 - 100)
    # GPA in this dataset ranges 2.0 to 4.0; avg_course_grade 50 to 100
    gpa_deficit = max(0.0, min(100.0, ((4.0 - gpa) / 2.0) * 100.0))
    grade_deficit = max(0.0, min(100.0, ((100.0 - grade) / 50.0) * 100.0))
    academic_deficit = (gpa_deficit * 0.7) + (grade_deficit * 0.3)

    # 2. Attendance Deficit (Scale: 0 - 100)
    # Attendance ranges 0.60 to 1.00
    attendance_deficit = max(0.0, min(100.0, ((1.0 - att) / 0.40) * 100.0))

    # 3. Engagement Deficit (Scale: 0 - 100)
    assignment_def = (1.0 - max(0.0, min(1.0, assign))) * 100.0
    login_def = max(0.0, (35.0 - min(35.0, logins)) / 35.0 * 100.0)
    video_def = (1.0 - max(0.0, min(1.0, video))) * 100.0
    engagement_deficit = (assignment_def * 0.4) + (login_def * 0.3) + (video_def * 0.3)

    # 4. Administrative / Enrollment Deficit (Scale: 0 - 100)
    if status.lower() == "leave":
        admin_deficit = 75.0
    elif status.lower() == "graduated":
        admin_deficit = 10.0
    else:
        admin_deficit = 35.0 if load >= 6 else (10.0 if load <= 3 else 15.0)

    # Composite Weighted Risk Score
    risk_score = round(
        (0.35 * academic_deficit) +
        (0.35 * attendance_deficit) +
        (0.15 * engagement_deficit) +
        (0.15 * admin_deficit),
        1
    )
    risk_score = max(0.0, min(100.0, risk_score))

    # Risk Level & Colors
    if risk_score >= 55.0:
        risk_level = "High Risk"
        risk_color = "#ef4444"
    elif risk_score >= 35.0:
        risk_level = "Medium Risk"
        risk_color = "#f59e0b"
    else:
        risk_level = "Low Risk"
        risk_color = "#10b981"

    # Automated Recommendations
    recommendations = []
    if att < 0.75:
        recommendations.append("Attendance Alert: Class attendance below 75% threshold (Parent notice).")
    if gpa < 2.5 or grade < 65.0:
        recommendations.append("Academic Warning: Enroll in Peer Tutoring & Faculty Remedial sessions.")
    if status.lower() == "leave":
        recommendations.append("Enrollment Follow-up: Student on leave. Conduct re-engagement interview.")
    if assign < 0.70 or logins < 12:
        recommendations.append("LMS Engagement Notice: Low portal activity & assignment submission lag.")
    if len(recommendations) == 0:
        recommendations.append("Student on track. Standard academic advisory & mentoring.")

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "risk_color": risk_color,
        "breakdown": {
            "academic": round(academic_deficit, 1),
            "attendance": round(attendance_deficit, 1),
            "engagement": round(engagement_deficit, 1),
            "administrative": round(admin_deficit, 1)
        },
        "recommendations": recommendations
    }

def get_dropout_analytics(live_attendance_pct_map=None, limit=100, major_filter=None, status_filter=None):
    """
    Returns full analytics over the 1,545 records from college_student_management_data.csv.
    """
    raw_data = load_raw_dataset()
    total_students = len(raw_data)

    high_risk_count = 0
    medium_risk_count = 0
    low_risk_count = 0
    total_att = 0.0
    total_gpa = 0.0

    students_list = []

    for idx, r in enumerate(raw_data):
        gpa = float(r.get("GPA") or 3.0)
        att = float(r.get("attendance_rate") or 0.8)
        actual_risk = r.get("risk_level", "Medium")

        # Map live face attendance if student ID / name matches
        if live_attendance_pct_map and r.get("student_id") in live_attendance_pct_map:
            att = live_attendance_pct_map[r.get("student_id")] / 100.0

        eval_res = calculate_student_risk(r)
        pred_level = eval_res["risk_level"]

        if actual_risk == "High":
            high_risk_count += 1
        elif actual_risk == "Medium":
            medium_risk_count += 1
        else:
            low_risk_count += 1

        total_att += (att * 100.0)
        total_gpa += gpa

        # Filter for table pagination/display
        match_major = (not major_filter) or (r.get("major") == major_filter)
        match_status = (not status_filter) or (r.get("enrollment_status") == status_filter)

        if match_major and match_status and len(students_list) < limit:
            students_list.append({
                "student_id": r.get("student_id"),
                "major": r.get("major"),
                "gender": r.get("gender"),
                "age": r.get("age"),
                "gpa": round(gpa, 2),
                "attendance_rate": round(att * 100.0, 1),
                "avg_course_grade": round(float(r.get("avg_course_grade") or 0), 1),
                "enrollment_status": r.get("enrollment_status"),
                "course_load": r.get("course_load"),
                "lms_logins": r.get("lms_logins_past_month"),
                "assignment_rate": round(float(r.get("assignment_submission_rate") or 0) * 100.0, 1),
                "actual_risk": actual_risk,
                "predicted_score": eval_res["risk_score"],
                "predicted_level": eval_res["risk_level"],
                "risk_color": eval_res["risk_color"],
                "recommendations": eval_res["recommendations"]
            })

    avg_attendance = round(total_att / total_students, 1) if total_students > 0 else 0.0
    avg_gpa = round(total_gpa / total_students, 2) if total_students > 0 else 0.0

    return {
        "kpis": {
            "total_students": total_students,
            "high_risk_count": high_risk_count,
            "medium_risk_count": medium_risk_count,
            "low_risk_count": low_risk_count,
            "retention_rate": round(((total_students - high_risk_count) / total_students) * 100, 1),
            "avg_attendance": avg_attendance,
            "avg_gpa": avg_gpa
        },
        "students": students_list
    }

def compute_confusion_matrix(threshold=50.0):
    """
    Computes Confusion Matrix for the 1,545 records in college_student_management_data.csv:
    - Actual High Risk vs Predicted High Risk (at given threshold)
    - True Positive (TP): Actual High Risk student correctly identified
    - True Negative (TN): Safe (Medium/Low) student correctly identified
    - False Positive (FP): Safe student incorrectly flagged as High Risk (False Alarm)
    - False Negative (FN): High Risk student missed (Silent Dropout - Critical Risk!)
    """
    raw_data = load_raw_dataset()
    tp = 0
    tn = 0
    fp = 0
    fn = 0

    major_stats = {}
    status_stats = {}

    for r in raw_data:
        actual_is_high = 1 if r.get("risk_level") == "High" else 0
        eval_res = calculate_student_risk(r)
        predicted_is_high = 1 if eval_res["risk_score"] >= threshold else 0

        if actual_is_high == 1 and predicted_is_high == 1:
            tp += 1
        elif actual_is_high == 0 and predicted_is_high == 0:
            tn += 1
        elif actual_is_high == 0 and predicted_is_high == 1:
            fp += 1
        else:
            fn += 1

        major = r.get("major", "Other")
        if major not in major_stats:
            major_stats[major] = {"total": 0, "high_risk": 0}
        major_stats[major]["total"] += 1
        if actual_is_high:
            major_stats[major]["high_risk"] += 1

        status = r.get("enrollment_status", "Active")
        if status not in status_stats:
            status_stats[status] = {"total": 0, "high_risk": 0}
        status_stats[status]["total"] += 1
        if actual_is_high:
            status_stats[status]["high_risk"] += 1

    total = tp + tn + fp + fn
    accuracy = round(((tp + tn) / total) * 100, 1) if total > 0 else 0.0
    precision = round((tp / (tp + fp)) * 100, 1) if (tp + fp) > 0 else 0.0
    recall = round((tp / (tp + fn)) * 100, 1) if (tp + fn) > 0 else 0.0
    f1 = round(2 * ((precision * recall) / (precision + recall)), 1) if (precision + recall) > 0 else 0.0
    specificity = round((tn / (tn + fp)) * 100, 1) if (tn + fp) > 0 else 0.0

    return {
        "dataset_name": "college_student_management_data.csv",
        "total_records": total,
        "threshold": threshold,
        "matrix": {
            "tp": tp,
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "total": total
        },
        "metrics": {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "specificity": specificity
        },
        "major_breakdown": major_stats,
        "status_breakdown": status_stats
    }
