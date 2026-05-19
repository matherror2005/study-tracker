"""
Study Tracker — Flask 主程序
本地学习进度追踪 Web App
启动：python app.py  → 浏览器访问 http://localhost:5001
"""

import os
from flask import Flask, render_template, request, jsonify, send_file
from database import (
    init_db, seed_data, migrate_old_notes,
    get_all_courses, get_course, add_course, update_course, delete_course,
    get_all_assignments, add_assignment, update_assignment, delete_assignment, toggle_assignment,
    get_review_tasks, add_review_task, update_review_task, delete_review_task,
    get_chapters, add_chapter, update_chapter, delete_chapter, reorder_chapters,
    get_chapter_note, save_chapter_note, search_notes,
    add_pdf_attachment, get_pdf_attachments, get_pdf_attachment, delete_pdf_attachment,
    get_pdfs_for_chapter,
    get_dashboard_data,
    add_time_log, get_time_logs, get_weekly_time_data, delete_time_log,
    get_time_logs_stats,
    get_music_tracks, add_music_track, get_music_track, delete_music_track,
)
from dotenv import load_dotenv
load_dotenv()  # 加载 .env 文件中的环境变量

app = Flask(__name__)


# ──────────────────────────────────────
#  页面入口（单页应用）
# ──────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ──────────────────────────────────────
#  Dashboard API
# ──────────────────────────────────────

@app.route("/api/dashboard")
def api_dashboard():
    return jsonify(get_dashboard_data())


# ──────────────────────────────────────
#  课程 API
# ──────────────────────────────────────

@app.route("/api/courses", methods=["GET", "POST"])
def api_courses():
    if request.method == "GET":
        return jsonify(get_all_courses())
    data = request.json
    cid = add_course(data["name"], data["exam_date"], data.get("color", "#3b82f6"))
    return jsonify({"id": cid}), 201


@app.route("/api/courses/<int:course_id>", methods=["PUT", "DELETE"])
def api_course(course_id):
    if request.method == "DELETE":
        delete_course(course_id)
        return jsonify({"ok": True})
    data = request.json
    update_course(course_id, data["name"], data["exam_date"], data.get("color", "#3b82f6"))
    return jsonify({"ok": True})


# ──────────────────────────────────────
#  作业 API
# ──────────────────────────────────────

@app.route("/api/assignments", methods=["GET", "POST"])
def api_assignments():
    if request.method == "GET":
        course_id = request.args.get("course_id", type=int)
        return jsonify(get_all_assignments(course_id))
    data = request.json
    aid = add_assignment(
        data["course_id"], data["title"], data["due_date"],
        data.get("priority", "中"),
    )
    return jsonify({"id": aid}), 201


@app.route("/api/assignments/<int:assignment_id>", methods=["PUT", "DELETE"])
def api_assignment(assignment_id):
    if request.method == "DELETE":
        delete_assignment(assignment_id)
        return jsonify({"ok": True})
    data = request.json
    update_assignment(assignment_id, **data)
    return jsonify({"ok": True})


@app.route("/api/assignments/<int:assignment_id>/toggle", methods=["POST"])
def api_toggle_assignment(assignment_id):
    toggle_assignment(assignment_id)
    return jsonify({"ok": True})


# ──────────────────────────────────────
#  复习任务 API
# ──────────────────────────────────────

@app.route("/api/review-tasks", methods=["GET", "POST"])
def api_review_tasks():
    if request.method == "GET":
        course_id = request.args.get("course_id", type=int)
        return jsonify(get_review_tasks(course_id))
    data = request.json
    tid = add_review_task(
        data["course_id"], data["title"],
        data.get("chapter", ""), data.get("order_index", 0),
    )
    return jsonify({"id": tid}), 201


@app.route("/api/review-tasks/<int:task_id>", methods=["PUT", "DELETE"])
def api_review_task(task_id):
    if request.method == "DELETE":
        delete_review_task(task_id)
        return jsonify({"ok": True})
    data = request.json
    update_review_task(task_id, **data)
    return jsonify({"ok": True})


# ──────────────────────────────────────
#  章节 + 笔记 + PDF 附件 API
# ──────────────────────────────────────

# ── 章节 ──

@app.route("/api/chapters/<int:course_id>", methods=["GET", "POST"])
def api_chapters(course_id):
    if request.method == "GET":
        return jsonify(get_chapters(course_id))
    data = request.json
    cid = add_chapter(course_id, data["title"], data.get("order_index", 0))
    return jsonify({"id": cid}), 201


@app.route("/api/chapters/reorder", methods=["POST"])
def api_reorder_chapters():
    data = request.json
    reorder_chapters(data.get("ordered_ids", []))
    return jsonify({"ok": True})


@app.route("/api/chapters/<int:chapter_id>", methods=["PUT", "DELETE"])
def api_chapter(chapter_id):
    if request.method == "DELETE":
        delete_chapter(chapter_id)
        return jsonify({"ok": True})
    data = request.json
    update_chapter(chapter_id, **data)
    return jsonify({"ok": True})


# ── 章节笔记 ──

@app.route("/api/chapter-notes/<int:chapter_id>", methods=["GET", "POST"])
def api_chapter_note(chapter_id):
    if request.method == "GET":
        note = get_chapter_note(chapter_id)
        return jsonify(note if note else {"chapter_id": chapter_id, "content": ""})
    data = request.json
    save_chapter_note(chapter_id, data.get("content", ""))
    return jsonify({"ok": True})


# ── 笔记搜索 ──

@app.route("/api/notes/search")
def api_search_notes():
    keyword = request.args.get("q", "")
    if not keyword:
        return jsonify([])
    return jsonify(search_notes(keyword))


# ── PDF 上传 ──

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads", "pdfs")
MUSIC_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads", "music")


@app.route("/api/chapters/<int:chapter_id>/upload-pdf", methods=["POST"])
def api_upload_pdf(chapter_id):
    if "file" not in request.files:
        return jsonify({"error": "未选择文件"}), 400
    f = request.files["file"]
    if not f.filename or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "仅支持 PDF 文件"}), 400
    # 20MB 限制
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > 20 * 1024 * 1024:
        return jsonify({"error": "文件大小不能超过 20MB"}), 400

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # uuid 重命名
    import uuid
    ext = ".pdf"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, safe_name)
    f.save(filepath)

    pid = add_pdf_attachment(chapter_id, f.filename, safe_name)
    return jsonify({"id": pid, "filename": f.filename}), 201


@app.route("/api/chapters/<int:chapter_id>/pdfs")
def api_list_pdfs(chapter_id):
    return jsonify(get_pdf_attachments(chapter_id))


@app.route("/api/pdfs/<int:pdf_id>", methods=["DELETE"])
def api_delete_pdf(pdf_id):
    pdf = get_pdf_attachment(pdf_id)
    if not pdf:
        return jsonify({"error": "附件不存在"}), 404
    # 删除物理文件
    filepath = os.path.join(UPLOAD_DIR, pdf["filepath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    delete_pdf_attachment(pdf_id)
    return jsonify({"ok": True})


# ──────────────────────────────────────
#  学习时间记录 API
# ──────────────────────────────────────

@app.route("/api/time-logs", methods=["GET", "POST"])
def api_time_logs():
    if request.method == "GET":
        course_id = request.args.get("course_id", type=int)
        return jsonify(get_time_logs(course_id))
    data = request.json
    tid = add_time_log(
        data["course_id"], data["date"],
        float(data.get("hours", 0)), data.get("note", ""),
    )
    return jsonify({"id": tid}), 201


@app.route("/api/time-logs/weekly")
def api_weekly_time():
    return jsonify(get_weekly_time_data())


@app.route("/api/time-logs/<int:log_id>", methods=["DELETE"])
def api_delete_time_log(log_id):
    delete_time_log(log_id)
    return jsonify({"ok": True})


@app.route("/api/time-logs/stats")
def api_time_logs_stats():
    return jsonify(get_time_logs_stats())


# ──────────────────────────────────────
#  音乐曲目 API
# ──────────────────────────────────────

@app.route("/api/music", methods=["GET"])
def api_list_music():
    return jsonify(get_music_tracks())


@app.route("/api/music/upload", methods=["POST"])
def api_upload_music():
    if "file" not in request.files:
        return jsonify({"error": "未选择文件"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "未选择文件"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in (".mp3", ".wav", ".ogg"):
        return jsonify({"error": "仅支持 mp3 / wav / ogg 格式"}), 400

    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > 50 * 1024 * 1024:
        return jsonify({"error": "文件大小不能超过 50MB"}), 400

    os.makedirs(MUSIC_DIR, exist_ok=True)
    import uuid
    safe_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(MUSIC_DIR, safe_name)
    f.save(filepath)

    # 读取时长
    duration = None
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(filepath)
        if audio and audio.info:
            duration = int(audio.info.length)
    except Exception:
        pass

    tid = add_music_track(f.filename, safe_name, duration)
    return jsonify({"id": tid, "filename": f.filename, "duration_sec": duration}), 201


@app.route("/api/music/<int:track_id>", methods=["DELETE"])
def api_delete_music(track_id):
    track = get_music_track(track_id)
    if not track:
        return jsonify({"error": "曲目不存在"}), 404
    filepath = os.path.join(MUSIC_DIR, track["filepath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    delete_music_track(track_id)
    return jsonify({"ok": True})


# ──────────────────────────────────────
#  PDF 导出复习计划
# ──────────────────────────────────────

@app.route("/api/export/study-plan")
def api_export_study_plan():
    """生成复习计划 PDF 并下载"""
    courses = get_all_courses()
    tasks = get_review_tasks()
    from datetime import date
    today = date.today()

    # 按课程分组
    grouped = {}
    for t in tasks:
        cid = t["course_id"]
        if cid not in grouped:
            grouped[cid] = {"course": None, "tasks": []}
        grouped[cid]["tasks"].append(t)
    for c in courses:
        if c["id"] in grouped:
            grouped[c["id"]]["course"] = c

    # 状态中文名
    status_labels = {"completed": "已完成", "in_progress": "进行中", "not_started": "未开始"}

    # 构建 HTML
    rows_html = ""
    for g in grouped.values():
        c = g["course"]
        if not c:
            continue
        exam_date = c["exam_date"]
        days_left = (date.fromisoformat(exam_date) - today).days
        rows_html += f"""
        <tr style="background:#f8fafc">
            <td colspan="4" style="padding:10px 12px;font-weight:700;font-size:15px;color:{c['color']}">
                ● {c['name']} &nbsp; 📅 {exam_date} &nbsp; ({days_left}天后考试)
            </td>
        </tr>"""
        if not g["tasks"]:
            rows_html += '<tr><td colspan="4" style="padding:8px 12px;color:#94a3b8">暂无复习任务</td></tr>'
        for t in g["tasks"]:
            sl = status_labels.get(t["status"], t["status"])
            rows_html += f"""
            <tr>
                <td style="padding:8px 12px">{t['title']}</td>
                <td style="padding:8px 12px">{t.get('chapter', '')}</td>
                <td style="padding:8px 12px">{sl}</td>
            </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>复习计划</title>
<style>
    body {{ font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 30px; color: #1e293b; }}
    h1 {{ font-size: 22px; margin-bottom: 4px; }}
    .subtitle {{ color: #64748b; font-size: 13px; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th {{ background: #1e293b; color: #fff; padding: 10px 12px; text-align: left; font-size: 13px; }}
    td {{ border-bottom: 1px solid #e2e8f0; font-size: 13px; }}
</style></head>
<body>
    <h1>📖 复习计划</h1>
    <p class="subtitle">生成日期: {today.isoformat()} &nbsp;|&nbsp; 共 {len(courses)} 门课程</p>
    <table>
        <thead><tr><th>任务</th><th>章节</th><th>状态</th></tr></thead>
        <tbody>{rows_html}</tbody>
    </table>
</body></html>"""

    import tempfile
    try:
        from weasyprint import HTML
        pdf_file = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        HTML(string=html).write_pdf(pdf_file.name)
        return send_file(pdf_file.name, mimetype="application/pdf",
                         as_attachment=True, download_name="复习计划.pdf")
    except ImportError:
        return jsonify({"error": "weasyprint 未安装，请运行 pip install weasyprint"}), 500


# ──────────────────────────────────────
#  AI 学习助理（DeepSeek API）
# ──────────────────────────────────────

import json as _json
import urllib.request as _urllib

DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT = (
    "你是一个学习助理，用户正在备考大学期末考试。"
    "你可以帮助解答学科问题、提供复习策略，"
    "以及当用户想要新功能时，生成清晰的代码修改说明让他们交给 Claude Code 执行。"
    "请用中文回复，语气友好简洁。"
)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return jsonify({
            "reply": "AI 助理未配置。请在项目根目录创建 .env 文件，设置 DEEPSEEK_API_KEY=你的API密钥。\n\n"
                     "获取 API Key: https://platform.deepseek.com/api_keys"
        }), 200

    data = request.json
    messages = data.get("messages", [])
    chapter_id = data.get("chapter_id")
    if not messages:
        return jsonify({"reply": "请发送消息开始对话 😊"})

    # 构建 system prompt（如有 chapter_id 则附加 PDF 文本）
    system_content = SYSTEM_PROMPT
    if chapter_id:
        pdf_paths = get_pdfs_for_chapter(int(chapter_id))
        if pdf_paths:
            pdf_texts = []
            for p in pdf_paths:
                full_path = os.path.join(UPLOAD_DIR, p)
                if os.path.exists(full_path):
                    try:
                        import fitz  # PyMuPDF
                        doc = fitz.open(full_path)
                        text = ""
                        for page in doc:
                            text += page.get_text()
                        doc.close()
                        if text.strip():
                            pdf_texts.append(f"--- 文件: {p} ---\n{text[:3000]}")
                    except Exception:
                        pdf_texts.append(f"--- 文件: {p} (无法提取文本，可能是扫描件或加密PDF) ---")
            if pdf_texts:
                pdf_context = "\n\n".join(pdf_texts)
                system_content += f"\n\n以下是用户上传的课程资料内容，请结合这些内容回答问题：\n\n{pdf_context}"

    # 构建 OpenAI 格式的消息列表（前面插入 system prompt）
    full_messages = [{"role": "system", "content": system_content}] + messages

    try:
        req_body = _json.dumps({
            "model": DEEPSEEK_MODEL,
            "messages": full_messages,
            "max_tokens": 1024,
        }).encode("utf-8")

        req = _urllib.Request(DEEPSEEK_API_URL, data=req_body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        })

        with _urllib.urlopen(req, timeout=60) as resp:
            result = _json.loads(resp.read().decode("utf-8"))

        reply = result["choices"][0]["message"]["content"]
        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"reply": f"AI 请求失败: {str(e)}"}), 500


# ──────────────────────────────────────
#  启动入口
# ──────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  Study Tracker — 学习进度追踪")
    print("  初始化数据库...")
    init_db()
    migrate_old_notes()
    seed_data()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(MUSIC_DIR, exist_ok=True)
    print("  启动服务器: http://localhost:5001")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5001, debug=True)
