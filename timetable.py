from datetime import datetime, time, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    return datetime.now(IST)

SUBJECTS = {
    "MIS": {
        "name": "Mathematics for Information Science-3",
        "faculty": "Ms. Nasla Kamaru (NSA)",
        "code": "GAMAT301"
    },
    "FAI": {
        "name": "Foundations of Artificial Intelligence",
        "faculty": "Dr. Amal Thomas K (ATK)",
        "code": "PCAIT302"
    },
    "FAI(T)": {
        "name": "Foundations of Artificial Intelligence (Tutorial)",
        "faculty": "Dr. Amal Thomas K (ATK)",
        "code": "PCAIT302"
    },
    "DS": {
        "name": "Data Structures and Algorithms",
        "faculty": "Dr. B Rahul (BRL)",
        "code": "PCCST303"
    },
    "DS(T)": {
        "name": "Data Structures and Algorithms (Tutorial)",
        "faculty": "Dr. B Rahul (BRL)",
        "code": "PCCST303"
    },
    "IDS": {
        "name": "Introduction to Data Science",
        "faculty": "Ms. Reethu Rajan (RRJ)",
        "code": "PBADT304"
    },
    "DEL": {
        "name": "Digital Electronics & Logic Design",
        "faculty": "Ms. Najiya Abdulrahiman (NJA)",
        "code": "GAEST305"
    },
    "DEL(T)": {
        "name": "Digital Electronics & Logic Design (Tutorial)",
        "faculty": "Ms. Najiya Abdulrahiman (NJA)",
        "code": "GAEST305"
    },
    "EE": {
        "name": "Engineering Ethics And Sustainable Development",
        "faculty": "Ms. Sharika A (SHA)",
        "code": "UCHUT347"
    },
    "DS LAB": {
        "name": "Data Structures Lab",
        "faculty": "Ms. Sandhra P R, Ms. Sumayya Beegam V K P (SPR, SUM)",
        "code": "PCCSL307"
    },
    "PSM LAB": {
        "name": "Python And Statistical Modelling Lab",
        "faculty": "Ms. Nesrin A C, Ms. Reethu Rajan (NAC, RRJ)",
        "code": "PCCDL308"
    },
    "SD-C": {
        "name": "Skill Development - Communication skill",
        "faculty": "Ms. Rishla Razak K A (RKA)",
        "code": "SD"
    },
    "SD-T": {
        "name": "Skill Development - Technical skill",
        "faculty": "Ms. Sandhra P R (SPR)",
        "code": "SD"
    },
    "LIB/REM": {
        "name": "Library / Remedial",
        "faculty": "Ms. Reethu Rajan (RRJ)",
        "code": "LIB/REM"
    }
}

# Monday - Thursday Period Time Slots
REGULAR_SLOTS = [
    ("Period 1", time(9, 0), time(9, 55), "09:00 - 09:55"),
    ("Period 2", time(9, 55), time(10, 50), "09:55 - 10:50"),
    ("Morning Break", time(10, 50), time(11, 0), "10:50 - 11:00"),
    ("Period 3", time(11, 0), time(11, 55), "11:00 - 11:55"),
    ("Period 4", time(11, 55), time(12, 50), "11:55 - 12:50"),
    ("Lunch Break", time(12, 50), time(13, 50), "12:50 - 01:50"),
    ("Period 5", time(13, 50), time(14, 40), "01:50 - 02:40"),
    ("Period 6", time(14, 40), time(15, 30), "02:40 - 03:30"),
    ("Evening Break", time(15, 30), time(15, 40), "03:30 - 03:40"),
    ("Period 7", time(15, 40), time(16, 30), "03:40 - 04:30")
]

# Friday Period Time Slots
FRIDAY_SLOTS = [
    ("Period 1", time(9, 0), time(9, 50), "09:00 - 09:50"),
    ("Period 2", time(9, 50), time(10, 40), "09:50 - 10:40"),
    ("Morning Break", time(10, 40), time(10, 50), "10:40 - 10:50"),
    ("Period 3", time(10, 50), time(11, 40), "10:50 - 11:40"),
    ("Period 4", time(11, 40), time(12, 30), "11:40 - 12:30"),
    ("Lunch Break", time(12, 30), time(13, 50), "12:30 - 01:50"),
    ("Period 5", time(13, 50), time(14, 40), "01:50 - 02:40"),
    ("Period 6", time(14, 40), time(15, 30), "02:40 - 03:30"),
    ("Evening Break", time(15, 30), time(15, 40), "03:30 - 03:40"),
    ("Period 7", time(15, 40), time(16, 30), "03:40 - 04:30")
]

TIMETABLE = {
    "Monday": {
        "Period 1": "IDS",
        "Period 2": "IDS",
        "Period 3": "DEL",
        "Period 4": "DS",
        "Period 5": "MIS",
        "Period 6": "LIB/REM",
        "Period 7": "DS(T)"
    },
    "Tuesday": {
        "Period 1": "DEL",
        "Period 2": "DS",
        "Period 3": "MIS",
        "Period 4": "FAI",
        "Period 5": "DS",
        "Period 6": "FAI(T)",
        "Period 7": "SD-C"
    },
    "Wednesday": {
        "Period 1": "FAI",
        "Period 2": "DS LAB",
        "Period 3": "DS LAB",
        "Period 4": "DS LAB",
        "Period 5": "IDS",
        "Period 6": "MIS",
        "Period 7": "EE"
    },
    "Thursday": {
        "Period 1": "FAI",
        "Period 2": "DEL",
        "Period 3": "IDS",
        "Period 4": "DS",
        "Period 5": "PSM LAB",
        "Period 6": "PSM LAB",
        "Period 7": "PSM LAB"
    },
    "Friday": {
        "Period 1": "DEL",
        "Period 2": "IDS",
        "Period 3": "EE",
        "Period 4": "MIS",
        "Period 5": "DEL(T)",
        "Period 6": "SD-T",
        "Period 7": "MIS"
    }
}

def get_current_period_info(dt=None):
    if dt is None:
        dt = get_ist_now()
        
    day_name = dt.strftime("%A")
    current_time = dt.time()
    
    slots = FRIDAY_SLOTS if day_name == "Friday" else REGULAR_SLOTS
    day_schedule = TIMETABLE.get(day_name, {})
    
    # Check if weekend
    if day_name in ["Saturday", "Sunday"]:
        weekend_periods = []
        for slot_name, s_start, s_end, time_label in REGULAR_SLOTS:
            if "Break" in slot_name:
                continue
            sub_code = TIMETABLE["Monday"].get(slot_name, "General")
            sub_info = SUBJECTS.get(sub_code, {"name": sub_code, "faculty": "Faculty", "code": ""})
            weekend_periods.append({
                "period": slot_name,
                "subject_code": sub_code,
                "subject_name": sub_info["name"],
                "faculty": sub_info["faculty"],
                "time_range": time_label
            })
        return {
            "is_class_active": False,
            "status": "Weekend / Holiday",
            "day": day_name,
            "period": "Off Day",
            "subject_code": "-",
            "subject_name": "College Weekend (Select period below to test)",
            "faculty": "-",
            "time_range": "-",
            "today_periods": weekend_periods
        }
        
    # Build list of periods for today for dropdowns
    today_periods = []
    for slot_name, s_start, s_end, time_label in slots:
        if "Break" in slot_name:
            continue
        sub_code = day_schedule.get(slot_name, "General")
        sub_info = SUBJECTS.get(sub_code, {"name": sub_code, "faculty": "Faculty", "code": ""})
        today_periods.append({
            "period": slot_name,
            "subject_code": sub_code,
            "subject_name": sub_info["name"],
            "faculty": sub_info["faculty"],
            "time_range": time_label
        })

    # Find currently active slot
    active_slot = None
    for slot_name, s_start, s_end, time_label in slots:
        if s_start <= current_time < s_end:
            active_slot = (slot_name, time_label)
            break
            
    if active_slot:
        slot_name, time_label = active_slot
        if "Break" in slot_name:
            return {
                "is_class_active": False,
                "status": slot_name,
                "day": day_name,
                "period": slot_name,
                "subject_code": "-",
                "subject_name": f"{slot_name} ({time_label})",
                "faculty": "-",
                "time_range": time_label,
                "today_periods": today_periods
            }
        else:
            sub_code = day_schedule.get(slot_name, "General")
            sub_info = SUBJECTS.get(sub_code, {"name": sub_code, "faculty": "Faculty", "code": ""})
            return {
                "is_class_active": True,
                "status": "Active Class",
                "day": day_name,
                "period": slot_name,
                "subject_code": sub_code,
                "subject_name": sub_info["name"],
                "faculty": sub_info["faculty"],
                "time_range": time_label,
                "today_periods": today_periods
            }
            
    # Outside college hours
    first_slot_start = slots[0][1]
    last_slot_end = slots[-1][2]
    
    if current_time < first_slot_start:
        status = "Before College Hours (Starts 09:00 AM)"
    else:
        status = "College Hours Ended (After 04:30 PM)"
        
    # Default to Period 1 as selected option if outside hours
    default_sub = day_schedule.get("Period 1", "General")
    default_info = SUBJECTS.get(default_sub, {"name": default_sub, "faculty": "Faculty", "code": ""})
    
    return {
        "is_class_active": False,
        "status": status,
        "day": day_name,
        "period": "Period 1 (Upcoming)",
        "subject_code": default_sub,
        "subject_name": default_info["name"],
        "faculty": default_info["faculty"],
        "time_range": slots[0][3],
        "today_periods": today_periods
    }
