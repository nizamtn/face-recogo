import sqlite3

conn = sqlite3.connect('attendance.db')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(students)")
cols = [col[1] for col in cursor.fetchall()]
print("Existing columns:", cols)

if "cloud_url" not in cols:
    cursor.execute("ALTER TABLE students ADD COLUMN cloud_url VARCHAR")
    conn.commit()
    print("Successfully added cloud_url column to students table!")
else:
    print("cloud_url column already exists.")

conn.close()
