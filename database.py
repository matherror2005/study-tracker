"""
SQLite 数据库操作模块
负责建表、增删改查、统计数据等所有数据库相关操作
"""

import sqlite3
import os
from datetime import date, datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "study_tracker.db")


def get_db():
    """获取数据库连接（开启外键约束 + 行工厂）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """初始化数据库：创建所有表"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            exam_date TEXT NOT NULL,          -- ISO 格式 YYYY-MM-DD
            color TEXT NOT NULL DEFAULT '#3b82f6',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,           -- ISO 格式 YYYY-MM-DD
            priority TEXT NOT NULL DEFAULT '中',  -- 高 / 中 / 低
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS review_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            chapter TEXT DEFAULT '',           -- 章节号/名称
            status TEXT NOT NULL DEFAULT 'not_started',  -- not_started / in_progress / completed
            order_index INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            order_index INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapter_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_id INTEGER UNIQUE NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pdf_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS time_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            date TEXT NOT NULL,               -- ISO 格式 YYYY-MM-DD
            hours REAL NOT NULL DEFAULT 0,
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS music_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            duration_sec INTEGER,
            uploaded_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
    """)

    conn.commit()
    conn.close()


def migrate_old_notes():
    """将旧 notes 表数据迁移到新的 chapters + chapter_notes 结构"""
    conn = get_db()
    # 检查旧表是否存在
    old_exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    ).fetchone()
    if not old_exists:
        conn.close()
        return

    # 检查新 chapters 表是否已有数据（避免重复迁移）
    chap_count = conn.execute("SELECT COUNT(*) AS cnt FROM chapters").fetchone()["cnt"]
    if chap_count > 0:
        conn.close()
        return

    rows = conn.execute("SELECT * FROM notes").fetchall()
    for row in rows:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # 为每门课创建默认章节
        cur = conn.execute(
            "INSERT INTO chapters (course_id, title, order_index) VALUES (?, '默认章节', 0)",
            (row["course_id"],),
        )
        chapter_id = cur.lastrowid
        conn.execute(
            "INSERT INTO chapter_notes (chapter_id, content, updated_at) VALUES (?, ?, ?)",
            (chapter_id, row["content"] or "", row["updated_at"] or now),
        )

    # 旧表保留不删，仅做数据迁移
    conn.commit()
    conn.close()
    print(f"  已迁移 {len(rows)} 条旧笔记到新结构（旧 notes 表已保留）")


# ──────────────────────────────────────
#  课程 CRUD
# ──────────────────────────────────────

def get_all_courses():
    """获取所有课程，按考试日期排序"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM courses ORDER BY exam_date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_course(course_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def add_course(name: str, exam_date: str, color: str = "#3b82f6"):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO courses (name, exam_date, color) VALUES (?, ?, ?)",
        (name, exam_date, color),
    )
    conn.commit()
    course_id = cur.lastrowid
    conn.close()
    return course_id


def update_course(course_id: int, name: str, exam_date: str, color: str):
    conn = get_db()
    conn.execute(
        "UPDATE courses SET name = ?, exam_date = ?, color = ? WHERE id = ?",
        (name, exam_date, color, course_id),
    )
    conn.commit()
    conn.close()


def delete_course(course_id: int):
    """删除课程（级联删除作业、复习任务、笔记）"""
    conn = get_db()
    conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    conn.commit()
    conn.close()


# ──────────────────────────────────────
#  作业 CRUD
# ──────────────────────────────────────

def get_all_assignments(course_id: int = None):
    conn = get_db()
    if course_id:
        rows = conn.execute(
            "SELECT a.*, c.name AS course_name, c.color AS course_color "
            "FROM assignments a JOIN courses c ON a.course_id = c.id "
            "WHERE a.course_id = ? ORDER BY a.due_date ASC",
            (course_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT a.*, c.name AS course_name, c.color AS course_color "
            "FROM assignments a JOIN courses c ON a.course_id = c.id "
            "ORDER BY a.due_date ASC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_assignment(course_id: int, title: str, due_date: str, priority: str = "中"):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO assignments (course_id, title, due_date, priority) VALUES (?, ?, ?, ?)",
        (course_id, title, due_date, priority),
    )
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return aid


def update_assignment(assignment_id: int, **kwargs):
    """支持部分更新：title, due_date, priority, completed"""
    allowed = {"title", "due_date", "priority", "completed"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [assignment_id]
    conn = get_db()
    conn.execute(f"UPDATE assignments SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_assignment(assignment_id: int):
    conn = get_db()
    conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
    conn.commit()
    conn.close()


def toggle_assignment(assignment_id: int):
    """切换作业完成状态"""
    conn = get_db()
    row = conn.execute("SELECT completed FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    if row:
        new_val = 0 if row["completed"] else 1
        conn.execute("UPDATE assignments SET completed = ? WHERE id = ?", (new_val, assignment_id))
        conn.commit()
    conn.close()


# ──────────────────────────────────────
#  复习任务 CRUD
# ──────────────────────────────────────

def get_review_tasks(course_id: int = None):
    conn = get_db()
    if course_id:
        rows = conn.execute(
            "SELECT r.*, c.name AS course_name, c.color AS course_color "
            "FROM review_tasks r JOIN courses c ON r.course_id = c.id "
            "WHERE r.course_id = ? ORDER BY r.order_index ASC",
            (course_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT r.*, c.name AS course_name, c.color AS course_color "
            "FROM review_tasks r JOIN courses c ON r.course_id = c.id "
            "ORDER BY r.order_index ASC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_review_task(course_id: int, title: str, chapter: str = "", order_index: int = 0):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO review_tasks (course_id, title, chapter, order_index) VALUES (?, ?, ?, ?)",
        (course_id, title, chapter, order_index),
    )
    conn.commit()
    tid = cur.lastrowid
    conn.close()
    return tid


def update_review_task(task_id: int, **kwargs):
    allowed = {"title", "chapter", "status", "order_index"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [task_id]
    conn = get_db()
    conn.execute(f"UPDATE review_tasks SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_review_task(task_id: int):
    conn = get_db()
    conn.execute("DELETE FROM review_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


# ──────────────────────────────────────
#  章节 + 笔记 + PDF 附件 CRUD（两层结构）
# ──────────────────────────────────────

# ── 章节 ──

def get_chapters(course_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT ch.*, "
        "  (SELECT cn.updated_at FROM chapter_notes cn WHERE cn.chapter_id = ch.id) AS last_updated "
        "FROM chapters ch WHERE ch.course_id = ? ORDER BY ch.order_index ASC",
        (course_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_chapter(course_id: int, title: str, order_index: int = 0):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO chapters (course_id, title, order_index) VALUES (?, ?, ?)",
        (course_id, title, order_index),
    )
    chapter_id = cur.lastrowid
    # 同时创建空的 chapter_note
    conn.execute("INSERT INTO chapter_notes (chapter_id, content) VALUES (?, '')", (chapter_id,))
    conn.commit()
    conn.close()
    return chapter_id


def update_chapter(chapter_id: int, **kwargs):
    allowed = {"title", "order_index"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [chapter_id]
    conn = get_db()
    conn.execute(f"UPDATE chapters SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_chapter(chapter_id: int):
    conn = get_db()
    conn.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
    conn.commit()
    conn.close()


def reorder_chapters(ordered_ids: list):
    """批量更新章节排序"""
    conn = get_db()
    for idx, cid in enumerate(ordered_ids):
        conn.execute("UPDATE chapters SET order_index = ? WHERE id = ?", (idx, cid))
    conn.commit()
    conn.close()


# ── 章节笔记 ──

def get_chapter_note(chapter_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM chapter_notes WHERE chapter_id = ?", (chapter_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def save_chapter_note(chapter_id: int, content: str):
    conn = get_db()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "UPDATE chapter_notes SET content = ?, updated_at = ? WHERE chapter_id = ?",
        (content, now, chapter_id),
    )
    conn.commit()
    conn.close()


def search_notes(keyword: str):
    """按关键词搜索所有章节笔记"""
    conn = get_db()
    rows = conn.execute(
        "SELECT cn.*, ch.title AS chapter_title, ch.course_id, "
        "  c.name AS course_name, c.color AS course_color "
        "FROM chapter_notes cn "
        "JOIN chapters ch ON cn.chapter_id = ch.id "
        "JOIN courses c ON ch.course_id = c.id "
        "WHERE cn.content LIKE ?",
        (f"%{keyword}%",),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── PDF 附件 ──

def add_pdf_attachment(chapter_id: int, filename: str, filepath: str):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO pdf_attachments (chapter_id, filename, filepath) VALUES (?, ?, ?)",
        (chapter_id, filename, filepath),
    )
    conn.commit()
    pid = cur.lastrowid
    conn.close()
    return pid


def get_pdf_attachments(chapter_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM pdf_attachments WHERE chapter_id = ? ORDER BY uploaded_at DESC",
        (chapter_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_pdf_attachment(pdf_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM pdf_attachments WHERE id = ?", (pdf_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_pdf_attachment(pdf_id: int):
    conn = get_db()
    conn.execute("DELETE FROM pdf_attachments WHERE id = ?", (pdf_id,))
    conn.commit()
    conn.close()


def get_pdfs_for_chapter(chapter_id: int):
    """获取章节的所有 PDF 文件路径（供 AI 读取用）"""
    conn = get_db()
    rows = conn.execute(
        "SELECT filepath FROM pdf_attachments WHERE chapter_id = ?", (chapter_id,)
    ).fetchall()
    conn.close()
    return [r["filepath"] for r in rows]


# ──────────────────────────────────────
#  Dashboard 聚合数据
# ──────────────────────────────────────

def get_dashboard_data():
    """
    返回 Dashboard 需要的聚合数据：
    - 最近考试倒计时
    - 每门课程复习百分比
    - 本周作业完成情况
    - 今日待办
    - 综合评分
    """
    today = date.today()
    today_str = today.isoformat()
    # 本周一～周日
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    conn = get_db()

    # 最近考试
    nearest_exam = conn.execute(
        "SELECT name, exam_date, color FROM courses WHERE exam_date >= ? ORDER BY exam_date ASC LIMIT 1",
        (today_str,),
    ).fetchone()

    # 所有课程复习进度
    courses = conn.execute("SELECT * FROM courses ORDER BY exam_date ASC").fetchall()
    course_progress = []
    for c in courses:
        total = conn.execute(
            "SELECT COUNT(*) AS cnt FROM review_tasks WHERE course_id = ?", (c["id"],)
        ).fetchone()["cnt"]
        done = conn.execute(
            "SELECT COUNT(*) AS cnt FROM review_tasks WHERE course_id = ? AND status = 'completed'",
            (c["id"],),
        ).fetchone()["cnt"]
        pct = round(done / total * 100) if total > 0 else 0
        course_progress.append({
            "id": c["id"],
            "name": c["name"],
            "color": c["color"],
            "exam_date": c["exam_date"],
            "total_tasks": total,
            "completed_tasks": done,
            "progress_pct": pct,
        })

    # 本周作业
    week_assignments = conn.execute(
        "SELECT a.*, c.name AS course_name, c.color AS course_color "
        "FROM assignments a JOIN courses c ON a.course_id = c.id "
        "WHERE a.due_date BETWEEN ? AND ? ORDER BY a.due_date ASC",
        (week_start.isoformat(), week_end.isoformat()),
    ).fetchall()
    week_total = len(week_assignments)
    week_done = sum(1 for a in week_assignments if a["completed"])

    # 今日待办：今天截止的作业 + 所有未完成的复习任务（取前 10 条）
    today_assignments = conn.execute(
        "SELECT a.*, c.name AS course_name, c.color AS course_color "
        "FROM assignments a JOIN courses c ON a.course_id = c.id "
        "WHERE a.due_date = ? AND a.completed = 0 ORDER BY a.priority DESC",
        (today_str,),
    ).fetchall()

    today_reviews = conn.execute(
        "SELECT r.*, c.name AS course_name, c.color AS course_color "
        "FROM review_tasks r JOIN courses c ON r.course_id = c.id "
        "WHERE r.status != 'completed' ORDER BY r.order_index ASC LIMIT 10"
    ).fetchall()

    # 综合评分：作业完成率 (40%) + 复习完成率 (40%) + 紧迫度 (20%)
    total_assignments = conn.execute("SELECT COUNT(*) AS cnt FROM assignments").fetchone()["cnt"]
    done_assignments = conn.execute(
        "SELECT COUNT(*) AS cnt FROM assignments WHERE completed = 1"
    ).fetchone()["cnt"]
    assign_rate = done_assignments / total_assignments if total_assignments > 0 else 1

    total_reviews = conn.execute("SELECT COUNT(*) AS cnt FROM review_tasks").fetchone()["cnt"]
    done_reviews = conn.execute(
        "SELECT COUNT(*) AS cnt FROM review_tasks WHERE status = 'completed'"
    ).fetchone()["cnt"]
    review_rate = done_reviews / total_reviews if total_reviews > 0 else 1

    # 紧迫度：离最近考试的天数 / 30 天（越多天越不急）
    urgency = 0.5
    if nearest_exam:
        exam_date = datetime.strptime(nearest_exam["exam_date"], "%Y-%m-%d").date()
        days_left = (exam_date - today).days
        urgency = max(0, min(1, days_left / 30))

    overall_score = round(assign_rate * 40 + review_rate * 40 + urgency * 20)

    # 本周学习总时长
    week_time_rows = conn.execute(
        "SELECT COALESCE(SUM(hours), 0) AS total FROM time_logs WHERE date BETWEEN ? AND ?",
        (week_start.isoformat(), week_end.isoformat()),
    ).fetchone()
    weekly_hours = round(week_time_rows["total"], 1) if week_time_rows else 0

    conn.close()

    return {
        "nearest_exam": dict(nearest_exam) if nearest_exam else None,
        "days_until_exam": (datetime.strptime(nearest_exam["exam_date"], "%Y-%m-%d").date() - today).days
        if nearest_exam else None,
        "course_progress": course_progress,
        "week_assignments": {
            "total": week_total,
            "done": week_done,
            "list": [dict(a) for a in week_assignments],
        },
        "today_todos": {
            "assignments": [dict(a) for a in today_assignments],
            "review_tasks": [dict(r) for r in today_reviews],
        },
        "overall_score": overall_score,
        "weekly_hours": weekly_hours,
        "stats": {
            "total_assignments": total_assignments,
            "done_assignments": done_assignments,
            "total_reviews": total_reviews,
            "done_reviews": done_reviews,
        },
    }


# ──────────────────────────────────────
#  学习时间记录 CRUD
# ──────────────────────────────────────

def add_time_log(course_id: int, date: str, hours: float, note: str = ""):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO time_logs (course_id, date, hours, note) VALUES (?, ?, ?, ?)",
        (course_id, date, hours, note),
    )
    conn.commit()
    tid = cur.lastrowid
    conn.close()
    return tid


def get_time_logs(course_id: int = None):
    conn = get_db()
    if course_id:
        rows = conn.execute(
            "SELECT t.*, c.name AS course_name, c.color AS course_color "
            "FROM time_logs t JOIN courses c ON t.course_id = c.id "
            "WHERE t.course_id = ? ORDER BY t.date DESC, t.created_at DESC",
            (course_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT t.*, c.name AS course_name, c.color AS course_color "
            "FROM time_logs t JOIN courses c ON t.course_id = c.id "
            "ORDER BY t.date DESC, t.created_at DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_weekly_time_data():
    """返回本周（周一到周日）每天各课程的学习小时数，供 Chart.js 使用"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    conn = get_db()
    rows = conn.execute(
        "SELECT t.date, t.hours, c.name AS course_name, c.color AS course_color "
        "FROM time_logs t JOIN courses c ON t.course_id = c.id "
        "WHERE t.date BETWEEN ? AND ? ORDER BY t.date ASC",
        (week_start.isoformat(), week_end.isoformat()),
    ).fetchall()
    conn.close()

    # 按天 + 课程聚合
    day_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    result = {day_names[i]: {} for i in range(7)}
    for r in rows:
        day_idx = datetime.strptime(r["date"], "%Y-%m-%d").weekday()
        day_name = day_names[day_idx]
        course = r["course_name"]
        result[day_name][course] = result[day_name].get(course, 0) + r["hours"]
    return {
        "labels": day_names,
        "datasets": result,  # { "周一": {"高等数学": 2.5}, ... }
    }


def delete_time_log(log_id: int):
    conn = get_db()
    conn.execute("DELETE FROM time_logs WHERE id = ?", (log_id,))
    conn.commit()
    conn.close()


def get_time_logs_stats():
    """返回今日/本周/本月的按科目标计时统计数据"""
    today = date.today()
    today_str = today.isoformat()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    month_start = today.replace(day=1)
    # 本月最后一天
    next_month = today.replace(day=28) + timedelta(days=4)
    month_end = next_month - timedelta(days=next_month.day)

    conn = get_db()

    def query(sql, params):
        return [dict(r) for r in conn.execute(sql, params).fetchall()]

    # 今日各科
    today_stats = query(
        "SELECT c.name, c.color, COALESCE(SUM(t.hours), 0) AS total_hours "
        "FROM courses c LEFT JOIN time_logs t ON t.course_id = c.id AND t.date = ? "
        "GROUP BY c.id ORDER BY total_hours DESC",
        (today_str,),
    )

    # 本周每日
    week_stats = query(
        "SELECT t.date, COALESCE(SUM(t.hours), 0) AS total_hours "
        "FROM time_logs t WHERE t.date BETWEEN ? AND ? "
        "GROUP BY t.date ORDER BY t.date",
        (week_start.isoformat(), week_end.isoformat()),
    )

    # 本月每日
    month_stats = query(
        "SELECT t.date, COALESCE(SUM(t.hours), 0) AS total_hours "
        "FROM time_logs t WHERE t.date BETWEEN ? AND ? "
        "GROUP BY t.date ORDER BY t.date",
        (month_start.isoformat(), month_end.isoformat()),
    )

    # 构建本周标签（周一~周日）
    week_labels = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        week_labels.append(d.isoformat())

    # 构建本月标签
    month_labels = []
    d = month_start
    while d <= month_end:
        month_labels.append(d.isoformat())
        d += timedelta(days=1)

    conn.close()
    return {
        "today": today_stats,
        "week": {"labels": week_labels, "data": week_stats},
        "month": {"labels": month_labels, "data": month_stats},
    }


# ──────────────────────────────────────
#  音乐曲目 CRUD
# ──────────────────────────────────────

def get_music_tracks():
    conn = get_db()
    rows = conn.execute("SELECT * FROM music_tracks ORDER BY uploaded_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_music_track(filename: str, filepath: str, duration_sec: int = None):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO music_tracks (filename, filepath, duration_sec) VALUES (?, ?, ?)",
        (filename, filepath, duration_sec),
    )
    conn.commit()
    tid = cur.lastrowid
    conn.close()
    return tid


def get_music_track(track_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM music_tracks WHERE id = ?", (track_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_music_track(track_id: int):
    conn = get_db()
    conn.execute("DELETE FROM music_tracks WHERE id = ?", (track_id,))
    conn.commit()
    conn.close()


# ──────────────────────────────────────
#  种子数据（第一次启动时预置）
# ──────────────────────────────────────

def seed_data():
    """插入示例数据（仅当数据库为空时执行）"""
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) AS cnt FROM courses").fetchone()["cnt"]
    if count > 0:
        conn.close()
        return  # 已有数据，跳过

    today = date.today()

    # 3 门课程
    courses = [
        ("高等数学", (today + timedelta(days=28)).isoformat(), "#ef4444"),
        ("大学英语", (today + timedelta(days=32)).isoformat(), "#3b82f6"),
        ("数据结构", (today + timedelta(days=25)).isoformat(), "#10b981"),
    ]
    course_ids = []
    for name, exam, color in courses:
        cur = conn.execute(
            "INSERT INTO courses (name, exam_date, color) VALUES (?, ?, ?)",
            (name, exam, color),
        )
        course_ids.append(cur.lastrowid)

    # 示例作业
    assignments = [
        (course_ids[0], "第三章课后习题", (today + timedelta(days=2)).isoformat(), "高"),
        (course_ids[0], "期中错题整理", (today + timedelta(days=5)).isoformat(), "中"),
        (course_ids[1], "Unit 5 单词背诵", (today + timedelta(days=1)).isoformat(), "高"),
        (course_ids[1], "英语作文练习", (today + timedelta(days=4)).isoformat(), "低"),
        (course_ids[2], "二叉树遍历作业", (today + timedelta(days=3)).isoformat(), "高"),
        (course_ids[2], "哈希表实验报告", (today + timedelta(days=7)).isoformat(), "中"),
    ]
    for cid, title, due, priority in assignments:
        conn.execute(
            "INSERT INTO assignments (course_id, title, due_date, priority) VALUES (?, ?, ?, ?)",
            (cid, title, due, priority),
        )

    # 示例复习任务
    review_tasks = [
        (course_ids[0], "第一章 函数与极限", "Ch.1", "completed", 1),
        (course_ids[0], "第二章 导数与微分", "Ch.2", "completed", 2),
        (course_ids[0], "第三章 微分中值定理", "Ch.3", "in_progress", 3),
        (course_ids[0], "第四章 不定积分", "Ch.4", "not_started", 4),
        (course_ids[0], "第五章 定积分", "Ch.5", "not_started", 5),
        (course_ids[1], "Unit 1-2 词汇复习", "U1-2", "completed", 1),
        (course_ids[1], "Unit 3-4 语法整理", "U3-4", "in_progress", 2),
        (course_ids[1], "Unit 5 阅读理解", "U5", "not_started", 3),
        (course_ids[2], "线性表", "Ch.2", "completed", 1),
        (course_ids[2], "栈与队列", "Ch.3", "completed", 2),
        (course_ids[2], "树与二叉树", "Ch.4", "in_progress", 3),
        (course_ids[2], "图论", "Ch.5", "not_started", 4),
        (course_ids[2], "查找算法", "Ch.6", "not_started", 5),
    ]
    for cid, title, chapter, status, idx in review_tasks:
        conn.execute(
            "INSERT INTO review_tasks (course_id, title, chapter, status, order_index) VALUES (?, ?, ?, ?, ?)",
            (cid, title, chapter, status, idx),
        )

    # 示例章节 + 笔记
    seed_chapters = [
        (course_ids[0], "第一章 函数与极限", 0, "# 函数与极限笔记\n\n## 重点概念\n- 函数定义域与值域\n- 极限的 ε-δ 定义\n\n## 常见极限\n- $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$\n- $\\lim_{x \\to \\infty} (1 + \\frac{1}{x})^x = e$"),
        (course_ids[0], "第二章 导数与微分", 1, "# 导数笔记\n\n## 导数公式\n- $(x^n)' = nx^{n-1}$\n- $(e^x)' = e^x$\n\n## 易错点\n- 链式法则不要忘记内层求导"),
        (course_ids[1], "Unit 1-3 词汇语法", 0, "# 词汇语法笔记\n\n## 高频词汇\n- significant\n- consequently\n- nevertheless\n\n## 语法要点\n- 虚拟语气\n- 倒装句"),
        (course_ids[1], "Unit 4-5 阅读写作", 1, "# 阅读写作笔记\n\n## 作文模板\n1. 开头段：With the development of...\n2. 主体段：First and foremost...\n3. 结尾段：In conclusion..."),
        (course_ids[2], "线性表与栈队列", 0, "# 线性结构笔记\n\n## 时间复杂度对比\n| 操作 | 数组 | 链表 |\n|------|------|------|\n| 随机访问 | O(1) | O(n) |\n| 插入删除 | O(n) | O(1) |\n\n## 栈的应用\n- 括号匹配\n- 表达式求值"),
        (course_ids[2], "树与图", 1, "# 树与图笔记\n\n## 二叉树遍历\n- 前序：根左右\n- 中序：左根右\n- 后序：左右根\n\n## 图遍历\n- DFS\n- BFS"),
    ]
    for cid, title, order_idx, content in seed_chapters:
        cur = conn.execute(
            "INSERT INTO chapters (course_id, title, order_index) VALUES (?, ?, ?)",
            (cid, title, order_idx),
        )
        ch_id = cur.lastrowid
        conn.execute(
            "INSERT INTO chapter_notes (chapter_id, content) VALUES (?, ?)",
            (ch_id, content),
        )

    # 示例学习时间记录（本周前几天）
    time_logs = [
        (course_ids[0], (today - timedelta(days=today.weekday())).isoformat(), 2.5, "复习函数与极限"),
        (course_ids[1], (today - timedelta(days=today.weekday())).isoformat(), 1.0, "背单词"),
        (course_ids[2], (today - timedelta(days=today.weekday())).isoformat(), 1.5, "二叉树遍历练习"),
        (course_ids[0], (today - timedelta(days=today.weekday() - 1)).isoformat(), 3.0, "导数与微分习题"),
        (course_ids[2], (today - timedelta(days=today.weekday() - 1)).isoformat(), 2.0, "栈与队列"),
        (course_ids[1], (today - timedelta(days=today.weekday() - 1)).isoformat(), 1.5, "语法整理"),
        (course_ids[0], (today - timedelta(days=today.weekday() - 2)).isoformat(), 2.0, "中值定理"),
        (course_ids[2], (today - timedelta(days=today.weekday() - 2)).isoformat(), 2.5, "树与二叉树"),
    ]
    for cid, log_date, hrs, note in time_logs:
        conn.execute(
            "INSERT INTO time_logs (course_id, date, hours, note) VALUES (?, ?, ?, ?)",
            (cid, log_date, hrs, note),
        )

    conn.commit()
    conn.close()
