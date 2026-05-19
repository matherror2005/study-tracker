/**
 * Study Tracker — 前端逻辑
 * 单页应用：Tab 切换 / API 调用 / 渲染 / 模态框
 */

// ═══════════════════════════════════════════
//  全局状态
// ═══════════════════════════════════════════
const STATE = {
    currentTab: "dashboard",
    courses: [],           // 课程缓存
    modalCallback: null,   // 模态框提交回调
};

// ═══════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function formatDate(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr + "T00:00:00");
    const now = new Date();
    const diff = Math.ceil((d - now) / 86400000);
    const weekDay = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;

    if (diff < 0) return `${dateStr} (${Math.abs(diff)}天前)`;
    if (diff === 0) return `今天 ${weekDay}`;
    if (diff === 1) return `明天 ${weekDay}`;
    if (diff <= 3) return `${dateStr} ${weekDay} ⚡${diff}天后`;
    return `${dateStr} ${weekDay}`;
}

function priorityLabel(p) {
    return { "高": "高优先", "中": "中优先", "低": "低优先" }[p] || p;
}

function priorityBadge(p) {
    const colors = { "高": "#dc2626", "中": "#d97706", "低": "#16a34a" };
    return `<span class="pill" style="background:${colors[p] || '#999'}">${p}</span>`;
}

function statusBadge(s) {
    const colors = {
        completed: ["已完成", "#16a34a"],
        in_progress: ["进行中", "#d97706"],
        not_started: ["未开始", "#999"],
    };
    const [label, color] = colors[s] || [s, "#999"];
    return `<span class="pill" style="background:${color}">${label}</span>`;
}

// 简单 Markdown → HTML（支持标题/列表/粗体/斜体/代码/表格/引用）
function md2html(md) {
    if (!md) return "";
    let html = md;
    // 转义
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 代码块 ```...```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    // 行内代码 `...`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // 表格 |...|
    html = html.replace(/^\|(.+)\|\s*$/gm, (match) => {
        const cells = match.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
    });
    html = html.replace(/(<tr>.*<\/tr>\n?){2,}/g, "<table>$&</table>");
    // 标题
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // 粗体/斜体
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // 无序列表 - / *
    html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    // 引用 >
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    // 水平线
    html = html.replace(/^---+$/gm, "<hr>");
    // 段落
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";
    // 清理空标签
    html = html.replace(/<p>\s*<\/p>/g, "");
    html = html.replace(/<p>(<[hut].*?>)/g, "$1");
    html = html.replace(/(<\/[hut].*?>)<\/p>/g, "$1");
    return html;
}

// Toast 提示
function showToast(msg, type = "success") {
    const container = $(".toast-container") || createToastContainer();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 2500);
}

function createToastContainer() {
    const div = document.createElement("div");
    div.className = "toast-container";
    document.body.appendChild(div);
    return div;
}

// ═══════════════════════════════════════════
//  API 封装
// ═══════════════════════════════════════════

async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("API error:", err);
        showToast("请求失败: " + err.message, "error");
        throw err;
    }
}

// ═══════════════════════════════════════════
//  侧边栏 / 顶部栏
// ═══════════════════════════════════════════

function toggleSidebar() {
    const sidebar = $("#sidebar");
    sidebar.classList.toggle("collapsed");
    // 移动端用 open class
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle("open");
    }
}

function updateTopbar() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${["周日","周一","周二","周三","周四","周五","周六"][now.getDay()]}`;
    $("#topbarDate").textContent = dateStr;

    // 倒计时
    api("/api/dashboard").then(data => {
        if (data.days_until_exam !== null && data.days_until_exam !== undefined) {
            const days = data.days_until_exam;
            const name = data.nearest_exam ? data.nearest_exam.name : "";
            if (days <= 3) {
                $("#topbarCountdown").textContent = `⚠️ 距「${name}」考试仅剩 ${days} 天`;
            } else {
                $("#topbarCountdown").textContent = `距「${name}」考试还有 ${days} 天`;
            }
        } else {
            $("#topbarCountdown").textContent = "暂无考试";
            $("#topbarCountdown").style.background = "transparent";
            $("#topbarCountdown").style.color = "var(--c-muted)";
            $("#topbarCountdown").style.border = "none";
        }
    });
}

// ═══════════════════════════════════════════
//  Tab 切换
// ═══════════════════════════════════════════

function switchTab(tab) {
    STATE.currentTab = tab;
    // 更新导航高亮
    $$(".nav-item").forEach(el => {
        el.classList.toggle("active", el.dataset.tab === tab);
    });
    // 渲染对应内容
    switch (tab) {
        case "dashboard": renderDashboard(); break;
        case "courses": renderCourses(); break;
        case "assignments": renderAssignments(); break;
        case "review": renderReview(); break;
        case "notes": renderNotes(); break;
        case "timer": renderTimer(); break;
    }
}

// ═══════════════════════════════════════════
//  全局初始化
// ═══════════════════════════════════════════

async function init() {
    // 加载课程缓存
    STATE.courses = await api("/api/courses");
    updateTopbar();
    switchTab("dashboard");
    // 定时刷新
    setInterval(updateTopbar, 60000);
}

// ═══════════════════════════════════════════
//  Dashboard
// ═══════════════════════════════════════════

async function renderDashboard() {
    const data = await api("/api/dashboard");
    const main = $("#mainContent");

    // Metric: exam countdown
    const examDays = data.days_until_exam;
    const examName = data.nearest_exam ? data.nearest_exam.name : "";
    const examDate = data.nearest_exam ? data.nearest_exam.exam_date : "";

    // Metric: pending assignments
    const pendingCount = data.week_assignments.total - data.week_assignments.done;

    // Metric: streak (from data or compute simply)
    const streakDays = data.streak_days || 0;

    // Course progress
    let progressHTML = data.course_progress.map(c => {
        const daysToExam = Math.ceil((new Date(c.exam_date + "T00:00:00") - new Date()) / 86400000);
        const dailyHint = c.total_tasks > c.completed_tasks && daysToExam > 0
            ? `每天约 ${Math.ceil((c.total_tasks - c.completed_tasks) / daysToExam)} 个任务`
            : (c.progress_pct === 100 ? "全部完成" : "");
        return `
        <div class="progress-item">
            <div class="progress-item-header">
                <span class="progress-item-name" style="color:${c.color}">● ${c.name}</span>
                <span class="progress-item-pct">${c.progress_pct}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width:${c.progress_pct}%;background:${c.color}"></div>
            </div>
            <div class="progress-item-sub">${c.completed_tasks}/${c.total_tasks} 章节 · ${dailyHint}</div>
        </div>`;
    }).join("");

    // Today todos
    const todos = [
        ...data.today_todos.assignments.map(a => ({ ...a, type: "assignment" })),
        ...data.today_todos.review_tasks.map(r => ({ ...r, type: "review" })),
    ];
    let todoHTML = "";
    if (todos.length === 0) {
        todoHTML = `<div class="empty-state"><div class="empty-state-icon">✨</div><div class="empty-state-text">今天没有待办事项</div></div>`;
    } else {
        todoHTML = todos.slice(0, 8).map(t => `
            <div class="todo-item ${t.completed ? 'todo-done' : ''}">
                <div class="todo-check ${t.completed ? 'done' : ''}"
                     onclick="${t.type === 'assignment' ? `toggleAssignment(${t.id})` : `cycleReviewStatus(${t.id},'${t.status||'not_started'}')`}"></div>
                <span class="todo-text">${t.title}</span>
                <span class="pill" style="background:${t.course_color || '#999'}">${t.course_name}</span>
            </div>`).join("");
    }

    main.innerHTML = `
    <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">学习概览 · ${new Date().getFullYear()}年${new Date().getMonth()+1}月${new Date().getDate()}日</p>
    </div>
    <div class="metrics-row">
        <div class="metric-card">
            <div class="metric-label">距离考试</div>
            <div class="metric-value">${examDays !== null && examDays !== undefined ? examDays : '—'}<span style="font-size:16px;font-weight:400;color:var(--c-muted)"> 天</span></div>
            <div class="metric-sub">${examName ? examName + ' · ' + examDate : '暂无考试'}</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">待完成作业</div>
            <div class="metric-value">${pendingCount}<span style="font-size:16px;font-weight:400;color:var(--c-muted)"> 项</span></div>
            <div class="metric-sub">本周共 ${data.week_assignments.total} 项</div>
        </div>
        <div class="metric-card">
            <div class="metric-label">学习连续天数</div>
            <div class="metric-value">${streakDays}<span style="font-size:16px;font-weight:400;color:var(--c-muted)"> 天</span></div>
            <div class="metric-sub">综合评分 ${data.overall_score}/100</div>
        </div>
    </div>
    <div class="dashboard-columns">
        <div class="card">
            <div class="card-title" style="margin-bottom:16px">课程进度</div>
            <div class="progress-list">${progressHTML || '<div class="empty-state"><div class="empty-state-text">暂无课程</div></div>'}</div>
        </div>
        <div class="card">
            <div class="card-title" style="margin-bottom:16px">今日待办</div>
            <div class="todo-list">${todoHTML}</div>
        </div>
    </div>`;
}

// Placeholder for streak (can be enhanced with actual data)
// Using a simple approach: check how many consecutive past days have time logs

// ═══════════════════════════════════════════
//  Courses page
// ═══════════════════════════════════════════

async function renderCourses() {
    const main = $("#mainContent");
    const courses = STATE.courses;

    const gridHTML = courses.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">还没有课程，点击右上角添加</div></div>`
        : courses.map(c => {
            const daysToExam = Math.ceil((new Date(c.exam_date + "T00:00:00") - new Date()) / 86400000);
            return `
            <div class="course-card">
                <div class="course-card-accent" style="background:${c.color}"></div>
                <div class="course-card-name">${c.name}</div>
                <div class="course-card-exam">考试: ${c.exam_date} · ${daysToExam > 0 ? '还有 ' + daysToExam + ' 天' : (daysToExam === 0 ? '今天' : '已过期')}</div>
                <div class="course-card-actions">
                    <button class="btn btn-ghost btn-xs" onclick="showEditCourseModal(${c.id})">编辑</button>
                    <button class="btn btn-ghost btn-xs" onclick="switchTab('assignments');renderAssignments(${c.id})">查看作业</button>
                    <button class="btn btn-xs btn-danger" onclick="deleteCourse(${c.id})">删除</button>
                </div>
            </div>`;
        }).join("");

    main.innerHTML = `
    <div class="page-header">
        <h1 class="page-title">Courses</h1>
        <p class="page-subtitle">${courses.length} 门课程</p>
    </div>
    <div style="margin-bottom:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" onclick="showAddCourseModal()">+ 添加课程</button>
    </div>
    <div class="course-grid">${gridHTML}</div>`;
}

async function initWeeklyChart() {
    const canvas = document.getElementById("weeklyTimeChart");
    if (!canvas) return;
    const weeklyData = await api("/api/time-logs/weekly");
    // 收集所有课程名
    const courseSet = new Set();
    for (const dayData of Object.values(weeklyData.datasets)) {
        for (const c of Object.keys(dayData)) courseSet.add(c);
    }
    const courseNames = [...courseSet];
    // 获取课程颜色
    const courseColors = {};
    for (const c of STATE.courses) courseColors[c.name] = c.color;

    // 构建 Chart.js datasets（每个课程一个 dataset）
    const datasets = courseNames.map(name => ({
        label: name,
        data: weeklyData.labels.map(day => weeklyData.datasets[day]?.[name] || 0),
        backgroundColor: courseColors[name] || "#3b82f6",
        borderRadius: 4,
    }));

    // 销毁旧图表
    if (window._weeklyChart) window._weeklyChart.destroy();
    window._weeklyChart = new Chart(canvas, {
        type: "bar",
        data: { labels: weeklyData.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } } },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, title: { display: true, text: "小时", font: { size: 11 } }, beginAtZero: true },
            },
        },
    });
}

// ═══════════════════════════════════════════
//  作业页面
// ═══════════════════════════════════════════

async function renderAssignments(filterCourseId = null) {
    const assignments = await api("/api/assignments");
    const main = $("#mainContent");

    // 课程筛选标签
    const tabsHTML = STATE.courses.map(c => `
        <button class="course-tab ${filterCourseId === c.id ? 'active' : ''}"
                onclick="renderAssignments(${filterCourseId === c.id ? 'null' : c.id})"
                style="${filterCourseId === c.id ? 'background:' + c.color + ';border-color:' + c.color + ';' : ''}">
            ${c.name}
        </button>
    `).join("");

    const filtered = filterCourseId
        ? assignments.filter(a => a.course_id === filterCourseId)
        : assignments;

    // 排序：未完成在前，截止日期近的在前
    filtered.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.due_date) - new Date(b.due_date);
    });

    const listHTML = filtered.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">暂无作业，点击右上角添加</div></div>`
        : filtered.map(a => {
            const daysLeft = (new Date(a.due_date + "T00:00:00") - new Date()) / 86400000;
            const isUrgent = !a.completed && daysLeft <= 3 && daysLeft >= 0;
            const priColors = { "高": "#dc2626", "中": "#d97706", "低": "#16a34a" };
            const priColor = priColors[a.priority] || "#999";
            return `
            <div class="assignment-item ${a.completed ? 'completed' : ''}">
                <div class="assignment-priority-dot" style="background:${priColor}" title="${a.priority}优先"></div>
                <div class="assignment-info">
                    <div class="assignment-title">${a.title}</div>
                    <div class="assignment-meta">
                        <span class="pill" style="background:${a.course_color}">${a.course_name}</span>
                    </div>
                </div>
                <span class="assignment-due ${isUrgent ? 'urgent' : ''}">${formatDate(a.due_date)}</span>
                <div class="assignment-actions">
                    <button class="btn-icon" onclick="event.stopPropagation();editAssignment(${a.id})" title="编辑">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="btn-icon btn-danger" onclick="event.stopPropagation();deleteAssignment(${a.id})" title="删除">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>`;
        }).join("");

    main.innerHTML = `
    <div class="page-header">
        <h1 class="page-title">Assignments</h1>
        <p class="page-subtitle">${filtered.length} 项作业</p>
    </div>
    <div class="card">
        <div class="card-header">
            <div class="card-title">作业列表</div>
            <button class="btn btn-primary btn-sm" onclick="showAddAssignmentModal()">+ 添加作业</button>
        </div>
        <div class="course-tabs">
            <button class="course-tab ${filterCourseId === null ? 'active' : ''}"
                    onclick="renderAssignments(null)">全部</button>
            ${tabsHTML}
        </div>
        <div class="assignment-list">${listHTML}</div>
    </div>`;
}

async function toggleAssignment(id) {
    await api(`/api/assignments/${id}/toggle`, { method: "POST" });
    showToast("状态已更新");
    if (STATE.currentTab === "assignments") renderAssignments();
    else renderDashboard();
}

async function deleteAssignment(id) {
    if (!confirm("确定删除这个作业吗？")) return;
    await api(`/api/assignments/${id}`, { method: "DELETE" });
    showToast("作业已删除");
    renderAssignments();
}

// ═══════════════════════════════════════════
//  复习计划页面
// ═══════════════════════════════════════════

async function renderReview() {
    const tasks = await api("/api/review-tasks");
    const main = $("#mainContent");

    // 按课程分组
    const grouped = {};
    for (const t of tasks) {
        if (!grouped[t.course_id]) {
            grouped[t.course_id] = {
                course_name: t.course_name,
                course_color: t.course_color,
                tasks: [],
            };
        }
        grouped[t.course_id].tasks.push(t);
    }

    let groupsHTML = "";
    for (const [cid, group] of Object.entries(grouped)) {
        const total = group.tasks.length;
        const done = group.tasks.filter(t => t.status === "completed").length;
        const pct = Math.round(done / total * 100);

        const tasksHTML = group.tasks.map(t => {
            const statusCls = { completed: "done", in_progress: "progress", not_started: "" }[t.status];
            return `
            <div class="review-task ${t.status === 'completed' ? 'completed' : ''}">
                <div class="review-status-dot ${statusCls}"
                     onclick="cycleReviewStatus(${t.id}, '${t.status}')"
                     title="点击切换状态"></div>
                <span class="review-task-title">${t.title}</span>
                ${t.chapter ? `<span style="font-size:11px;color:var(--c-muted)">${t.chapter}</span>` : ""}
                ${statusBadge(t.status)}
                <button class="btn-icon" onclick="event.stopPropagation();editReviewTask(${t.id})" title="编辑">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button class="btn-icon btn-danger" onclick="event.stopPropagation();deleteReviewTask(${t.id})" title="删除">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>`;
        }).join("");

        groupsHTML += `
        <div class="review-group">
            <div class="review-group-header">
                <div class="review-group-color" style="background:${group.course_color}"></div>
                <div class="review-group-name">${group.course_name}</div>
                <div class="review-group-stats">${done}/${total} 完成 (${pct}%)</div>
                <button class="btn btn-ghost btn-xs" onclick="showAddReviewTaskModal(${cid})">+ 添加</button>
            </div>
            ${tasksHTML}
        </div>`;
    }

    if (Object.keys(grouped).length === 0) {
        groupsHTML = `<div class="empty-state"><div class="empty-state-icon">📖</div><div class="empty-state-text">还没有复习任务，请先添加课程</div></div>`;
    }

    main.innerHTML = `
    <div class="page-header">
        <h1 class="page-title">Review plan</h1>
        <p class="page-subtitle">${Object.keys(grouped).length} 门课程 · ${tasks.length} 个任务</p>
    </div>
    <div class="card">
        <div class="card-header">
            <div class="card-title">复习计划</div>
            <div style="display:flex;gap:8px">
                <button class="btn btn-ghost btn-sm" onclick="exportStudyPlan()">Export PDF</button>
                <button class="btn btn-primary btn-sm" onclick="showAddReviewTaskModal()">+ 添加任务</button>
            </div>
        </div>
        ${groupsHTML}
    </div>`;
}

async function cycleReviewStatus(taskId, currentStatus) {
    const next = {
        not_started: "in_progress",
        in_progress: "completed",
        completed: "not_started",
    };
    await api(`/api/review-tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({ status: next[currentStatus] }),
    });
    showToast("状态已更新");
    renderReview();
}

async function deleteReviewTask(taskId) {
    if (!confirm("确定删除这个复习任务吗？")) return;
    await api(`/api/review-tasks/${taskId}`, { method: "DELETE" });
    showToast("任务已删除");
    renderReview();
}

// ═══════════════════════════════════════════
//  笔记页面（两层：课程 → 章节 → 编辑器 + PDF）
// ═══════════════════════════════════════════

let NOTES = {
    activeCourseId: null,
    activeChapterId: null,     // 非 null = 编辑模式
    content: "",
    searchQuery: "",
    autoSaveTimer: null,
    chaptersCache: {},         // { course_id: [chapter, ...] }
};

// ── 一级：课程 → 章节列表 ──

async function renderNotes() {
    // 如果有 activeChapterId 则进入编辑器，否则显示章节列表
    if (NOTES.activeChapterId) {
        return renderChapterEditor();
    }
    if (!NOTES.activeCourseId && STATE.courses.length > 0) {
        NOTES.activeCourseId = STATE.courses[0].id;
    }

    const main = $("#mainContent");
    const activeCourse = STATE.courses.find(c => c.id === NOTES.activeCourseId);

    // 加载所有课程的章节
    const courseChapters = {};
    for (const c of STATE.courses) {
        if (!NOTES.chaptersCache[c.id]) {
            NOTES.chaptersCache[c.id] = await api(`/api/chapters/${c.id}`);
        }
        courseChapters[c.id] = NOTES.chaptersCache[c.id];
    }

    const courseListHTML = STATE.courses.map(c => `
        <div class="notes-course-item ${NOTES.activeCourseId === c.id ? 'active' : ''}"
             onclick="selectNotesCourse(${c.id})">
            <div class="notes-course-dot" style="background:${c.color}"></div>
            ${c.name}
        </div>
    `).join("");

    const chapters = courseChapters[NOTES.activeCourseId] || [];
    let chaptersHTML = "";
    if (chapters.length === 0) {
        chaptersHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">还没有章节，在下方创建</div></div>`;
    } else {
        chaptersHTML = `<div class="notes-chapter-list" id="sortableChapterList">` +
            chapters.map((ch, i) => `
            <div class="notes-chapter-item" data-id="${ch.id}">
                <span class="chapter-order">${i + 1}</span>
                <span class="chapter-title" onclick="openChapterEditor(${ch.id})">${ch.title}</span>
                <span class="chapter-time">${(ch.last_updated || ch.created_at || "").slice(0, 10)}</span>
                <span class="chapter-actions">
                    <button class="btn-icon" onclick="event.stopPropagation();deleteNotesChapter(${ch.id})" title="删除">🗑</button>
                </span>
            </div>`).join("") +
            `</div>`;
    }

    main.innerHTML = `
    <div class="notes-layout">
        <div class="notes-sidebar">
            <div class="notes-sidebar-header">课程</div>
            <div class="notes-course-list">${courseListHTML}</div>
            <div style="padding:8px;border-top:0.5px solid var(--c-divider)">
                <input type="text" placeholder="搜索笔记..."
                       value="${NOTES.searchQuery}"
                       onkeyup="if(event.key==='Enter')searchNotes(this.value)"
                       style="width:100%;height:32px;padding:0 8px;border:0.5px solid var(--c-border);border-radius:6px;font-size:12px;outline:none;background:var(--c-bg)">
            </div>
        </div>
        <div class="notes-chapters-panel">
            <div class="notes-chapters-header">
                <div class="notes-chapters-title" style="color:${activeCourse ? activeCourse.color : ''}">
                    ${activeCourse ? '● ' + activeCourse.name + ' 章节' : '请选择课程'}
                </div>
            </div>
            ${chaptersHTML}
            <div class="add-chapter-row">
                <input type="text" id="newChapterTitle" placeholder="新章节标题..."
                       onkeydown="if(event.key==='Enter')addNotesChapter()">
                <button class="btn btn-primary btn-sm" onclick="addNotesChapter()">+ 添加</button>
            </div>
        </div>
    </div>`;

    // 初始化 SortableJS 拖拽排序
    const listEl = $("#sortableChapterList");
    if (listEl && typeof Sortable !== "undefined") {
        new Sortable(listEl, {
            animation: 150,
            ghostClass: "sortable-ghost",
            onEnd: function () {
                const ids = [...listEl.querySelectorAll(".notes-chapter-item")].map(el => parseInt(el.dataset.id));
                api("/api/chapters/reorder", { method: "POST", body: JSON.stringify({ ordered_ids: ids }) });
                // 更新缓存中的 order_index
                for (const c of (NOTES.chaptersCache[NOTES.activeCourseId] || [])) {
                    c.order_index = ids.indexOf(c.id);
                }
                NOTES.chaptersCache[NOTES.activeCourseId].sort((a, b) => a.order_index - b.order_index);
                showToast("排序已更新");
            },
        });
    }
}

function selectNotesCourse(courseId) {
    NOTES.activeCourseId = courseId;
    NOTES.activeChapterId = null;
    renderNotes();
}

async function addNotesChapter() {
    const input = $("#newChapterTitle");
    const title = input ? input.value.trim() : "";
    if (!title || !NOTES.activeCourseId) return;
    const chapters = NOTES.chaptersCache[NOTES.activeCourseId] || [];
    await api(`/api/chapters/${NOTES.activeCourseId}`, {
        method: "POST",
        body: JSON.stringify({ title, order_index: chapters.length }),
    });
    delete NOTES.chaptersCache[NOTES.activeCourseId];
    showToast("章节已创建");
    renderNotes();
}

async function deleteNotesChapter(chapterId) {
    if (!confirm("确定删除这个章节及其笔记和附件吗？")) return;
    await api(`/api/chapters/${chapterId}`, { method: "DELETE" });
    delete NOTES.chaptersCache[NOTES.activeCourseId];
    showToast("章节已删除");
    renderNotes();
}

// ── 二级：章节笔记编辑器 ──

async function openChapterEditor(chapterId) {
    NOTES.activeChapterId = chapterId;
    await renderChapterEditor();
}

async function goBackToChapters() {
    NOTES.activeChapterId = null;
    NOTES.content = "";
    clearAutoSaveTimer();
    renderNotes();
}

async function renderChapterEditor() {
    const main = $("#mainContent");
    const chapterId = NOTES.activeChapterId;
    // 查出章节所属课程
    let chapterCourse = null, chapterTitle = "";
    for (const [cid, chapters] of Object.entries(NOTES.chaptersCache)) {
        const found = chapters.find(ch => ch.id === chapterId);
        if (found) {
            chapterCourse = STATE.courses.find(c => c.id === parseInt(cid));
            chapterTitle = found.title;
            break;
        }
    }
    // 如果缓存里没有，重新加载
    if (!chapterCourse) {
        for (const c of STATE.courses) {
            const chapters = await api(`/api/chapters/${c.id}`);
            NOTES.chaptersCache[c.id] = chapters;
            const found = chapters.find(ch => ch.id === chapterId);
            if (found) { chapterCourse = c; chapterTitle = found.title; break; }
        }
    }

    const note = await api(`/api/chapter-notes/${chapterId}`);
    NOTES.content = note.content || "";
    const pdfs = await api(`/api/chapters/${chapterId}/pdfs`);

    main.innerHTML = `
    <div class="notes-editor-container">
        <div class="breadcrumb">
            <a onclick="goBackToChapters()">Notes</a>
            <span class="sep">/</span>
            <span style="color:${chapterCourse ? chapterCourse.color : ''}">${chapterCourse ? chapterCourse.name : ''}</span>
            <span class="sep">/</span>
            <strong>${chapterTitle}</strong>
        </div>
        <div class="notes-editor-header">
            <div class="notes-editor-title">${chapterTitle}</div>
            <div class="auto-save-indicator saved" id="autoSaveIndicator">已保存</div>
        </div>
        <div class="notes-content-area">
            <textarea class="notes-textarea" id="noteTextarea"
                      oninput="onNoteInput()"
                      onkeydown="handleTabKey(event)"
                      onscroll="syncScroll('textarea')">${NOTES.content}</textarea>
            <div class="notes-preview" id="notePreview" onscroll="syncScroll('preview')">${md2html(NOTES.content)}</div>
        </div>
        <div class="pdf-section" id="pdfDropZone"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handlePdfDrop(event)">
            <div class="pdf-section-header">PDF 附件</div>
            <div class="pdf-section-hint">拖拽 PDF 到此处上传（≤20MB）</div>
            <input type="file" id="pdfFileInput" accept=".pdf" style="display:none"
                   onchange="handlePdfSelect(event)">
            <button class="btn btn-ghost btn-sm" onclick="$('#pdfFileInput').click()">Upload PDF</button>
            <div class="pdf-file-list" id="pdfFileList">
                ${pdfs.map(p => `
                <div class="pdf-file-item">
                    <span>📄</span>
                    <span class="pdf-name">${p.filename}</span>
                    <span class="pdf-delete" onclick="deletePdf(${p.id})">删除</span>
                </div>`).join("")}
            </div>
        </div>
    </div>`;

    // 同步滚动初始绑定
    setupSyncScroll();
}

// 自动保存
function onNoteInput() {
    const ta = $("#noteTextarea");
    const preview = $("#notePreview");
    if (!ta || !preview) return;
    NOTES.content = ta.value;
    preview.innerHTML = md2html(ta.value);
    // 显示"保存中"
    const indicator = $("#autoSaveIndicator");
    if (indicator) { indicator.textContent = "保存中..."; indicator.className = "auto-save-indicator saving"; }
    // 防抖 1.5s
    clearAutoSaveTimer();
    NOTES.autoSaveTimer = setTimeout(doAutoSave, 1500);
}

function clearAutoSaveTimer() {
    if (NOTES.autoSaveTimer) { clearTimeout(NOTES.autoSaveTimer); NOTES.autoSaveTimer = null; }
}

async function doAutoSave() {
    if (!NOTES.activeChapterId) return;
    await api(`/api/chapter-notes/${NOTES.activeChapterId}`, {
        method: "POST",
        body: JSON.stringify({ content: NOTES.content }),
    });
    const indicator = $("#autoSaveIndicator");
    if (indicator) { indicator.textContent = "已保存"; indicator.className = "auto-save-indicator saved"; }
}

// Tab 键缩进
function handleTabKey(event) {
    if (event.key === "Tab") {
        event.preventDefault();
        const ta = event.target;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + "  " + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + 2;
        onNoteInput();
    }
}

// 同步滚动
let _syncActive = false;
function syncScroll(source) {
    if (_syncActive) { _syncActive = false; return; }
    _syncActive = true;
    const ta = $("#noteTextarea");
    const preview = $("#notePreview");
    if (!ta || !preview) { _syncActive = false; return; }
    if (source === "textarea") {
        const pct = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
        preview.scrollTop = pct * Math.max(0, preview.scrollHeight - preview.clientHeight);
    } else {
        const pct = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
        ta.scrollTop = pct * Math.max(0, ta.scrollHeight - ta.clientHeight);
    }
}
function setupSyncScroll() {
    _syncActive = false;
}

// ── PDF 上传 ──

async function handlePdfDrop(event) {
    event.preventDefault();
    $("#pdfDropZone").classList.remove("drag-over");
    const files = event.dataTransfer.files;
    for (const f of files) uploadPdfFile(f);
}

async function handlePdfSelect(event) {
    for (const f of event.target.files) uploadPdfFile(f);
    event.target.value = "";
}

async function uploadPdfFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) { showToast("仅支持 PDF 文件", "error"); return; }
    if (file.size > 20 * 1024 * 1024) { showToast("文件不能超过 20MB", "error"); return; }
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch(`/api/chapters/${NOTES.activeChapterId}/upload-pdf`, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) { const err = await res.json(); showToast(err.error || "上传失败", "error"); return; }
        showToast("PDF 已上传");
        // 刷新 PDF 列表
        const pdfs = await api(`/api/chapters/${NOTES.activeChapterId}/pdfs`);
        const listEl = $("#pdfFileList");
        if (listEl) {
            listEl.innerHTML = pdfs.map(p => `
            <div class="pdf-file-item">
                <span>📄</span>
                <span class="pdf-name">${p.filename}</span>
                <span class="pdf-delete" onclick="deletePdf(${p.id})">删除</span>
            </div>`).join("");
        }
    } catch (e) {
        showToast("上传失败: " + e.message, "error");
    }
}

async function deletePdf(pdfId) {
    if (!confirm("确定删除这个 PDF 附件吗？")) return;
    await api(`/api/pdfs/${pdfId}`, { method: "DELETE" });
    showToast("PDF 已删除");
    const pdfs = await api(`/api/chapters/${NOTES.activeChapterId}/pdfs`);
    const listEl = $("#pdfFileList");
    if (listEl) {
        listEl.innerHTML = pdfs.map(p => `
        <div class="pdf-file-item">
            <span>📄</span>
            <span class="pdf-name">${p.filename}</span>
            <span class="pdf-delete" onclick="deletePdf(${p.id})">删除</span>
        </div>`).join("");
    }
}

// ── 搜索 ──

async function searchNotes(q) {
    NOTES.searchQuery = q;
    if (!q.trim()) { NOTES.searchQuery = ""; renderNotes(); return; }
    const results = await api(`/api/notes/search?q=${encodeURIComponent(q)}`);
    const main = $("#mainContent");
    let resultsHTML = results.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">未找到匹配的笔记</div></div>`
        : results.map(n => {
            const preview = (n.content || "").substring(0, 200).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi"), m => `<span class="search-highlight">${m}</span>`);
            return `
            <div class="card" style="margin-bottom:12px;cursor:pointer"
                 onclick="NOTES.searchQuery='';NOTES.activeCourseId=${n.course_id};NOTES.activeChapterId=${n.chapter_id};renderNotes()">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span class="pill" style="background:${n.course_color}">${n.course_name}</span>
                    <span style="font-size:12px;color:var(--c-muted)">${n.chapter_title}</span>
                </div>
                <div style="font-size:13px;color:var(--c-muted)">${preview}...</div>
            </div>`;
        }).join("");

    main.innerHTML = `
    <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:600">🔍 搜索结果: "${q}"</span>
            <button class="btn btn-ghost btn-sm" onclick="NOTES.searchQuery='';NOTES.activeChapterId=null;renderNotes()">返回笔记</button>
        </div>
    </div>
    ${resultsHTML}`;
}

// ── 更新聊天发送以携带 chapter_id ──
const _origSendChat = sendChatMessage;
sendChatMessage = async function() {
    const input = $("#chatInput");
    const text = input.value.trim();
    if (!text || CHAT.loading) return;
    input.value = "";
    input.style.height = "auto";

    // 如果当前在章节编辑页面，更新提示
    if (NOTES.activeChapterId) {
        $("#chatHints").style.display = "none";
        // 给第一条 AI 消息带上 PDF 提示（仅在聊天窗口刚打开时）
    }

    CHAT.messages.push({ role: "user", content: text });
    appendChatBubble("user", text);
    CHAT.loading = true;
    const loadingEl = document.createElement("div");
    loadingEl.className = "chat-msg chat-msg-ai";
    loadingEl.id = "chatLoading";
    loadingEl.innerHTML = '<div class="chat-loading"><span></span><span></span><span></span></div>';
    $("#chatMessages").appendChild(loadingEl);
    scrollChatBottom();

    try {
        // 构建请求体，如果有活跃章节则带上 chapter_id
        const reqBody = { messages: CHAT.messages };
        if (NOTES.activeChapterId) reqBody.chapter_id = NOTES.activeChapterId;
        const res = await api("/api/chat", { method: "POST", body: JSON.stringify(reqBody) });
        loadingEl.remove();
        CHAT.loading = false;
        CHAT.messages.push({ role: "assistant", content: res.reply });
        appendChatBubble("ai", res.reply);
    } catch (err) {
        loadingEl.remove();
        CHAT.loading = false;
        appendChatBubble("ai", "抱歉，出了点问题 😢 请稍后再试。");
    }
};

// 聊天打开时的提示更新
const _origToggleChat = toggleChat;
toggleChat = function() {
    _origToggleChat();
    if (CHAT.open && NOTES.activeChapterId) {
        $("#chatHints").style.display = "flex";
        $("#chatHints").innerHTML = "<span>📄 已关联本章节 PDF，可直接提问</span>";
    } else if (CHAT.open && !NOTES.activeChapterId) {
        $("#chatHints").style.display = "flex";
        $("#chatHints").innerHTML = "<span>💡 问学习问题</span><span>🛠 说你想要的新功能</span><span>📋 要复习建议</span>";
    }
};

// ═══════════════════════════════════════════
//  模态框系统
// ═══════════════════════════════════════════

let modalData = {};  // 临时存储模态框数据

function openModal(title, bodyHTML, onSave) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalOverlay").classList.add("active");
    STATE.modalCallback = onSave;
}

function closeModal(event) {
    if (event && event.target !== $("#modalOverlay")) return;
    $("#modalOverlay").classList.remove("active");
    STATE.modalCallback = null;
}

function submitModal() {
    if (STATE.modalCallback) {
        STATE.modalCallback();
    }
    closeModal();
}

// ── 课程模态框 ──

function showAddCourseModal() {
    openModal("添加课程", `
        <div class="form-group">
            <label class="form-label">课程名称</label>
            <input class="form-input" id="fCourseName" placeholder="如：高等数学">
        </div>
        <div class="form-group">
            <label class="form-label">考试日期</label>
            <input class="form-input" type="date" id="fExamDate">
        </div>
        <div class="form-group">
            <label class="form-label">颜色标签</label>
            <input class="form-input" type="color" id="fColor" value="#3b82f6" style="height:36px;padding:4px">
        </div>
    `, async () => {
        const name = $("#fCourseName").value.trim();
        const examDate = $("#fExamDate").value;
        const color = $("#fColor").value;
        if (!name || !examDate) { showToast("请填写完整信息", "error"); return; }
        await api("/api/courses", { method: "POST", body: JSON.stringify({ name, exam_date: examDate, color }) });
        STATE.courses = await api("/api/courses");
        showToast("课程已添加");
        renderDashboard();
    });
}

function showEditCourseModal(id) {
    const course = STATE.courses.find(c => c.id === id);
    if (!course) return;
    openModal("编辑课程", `
        <div class="form-group">
            <label class="form-label">课程名称</label>
            <input class="form-input" id="fCourseName" value="${course.name}">
        </div>
        <div class="form-group">
            <label class="form-label">考试日期</label>
            <input class="form-input" type="date" id="fExamDate" value="${course.exam_date}">
        </div>
        <div class="form-group">
            <label class="form-label">颜色标签</label>
            <input class="form-input" type="color" id="fColor" value="${course.color}" style="height:36px;padding:4px">
        </div>
        <button class="btn btn-ghost btn-sm" style="color:#dc2626;margin-top:8px" onclick="deleteCourse(${id});closeModal()">删除此课程</button>
    `, async () => {
        const name = $("#fCourseName").value.trim();
        const examDate = $("#fExamDate").value;
        const color = $("#fColor").value;
        if (!name || !examDate) { showToast("请填写完整信息", "error"); return; }
        await api(`/api/courses/${id}`, { method: "PUT", body: JSON.stringify({ name, exam_date: examDate, color }) });
        STATE.courses = await api("/api/courses");
        showToast("课程已更新");
        renderDashboard();
    });
}

async function deleteCourse(id) {
    if (!confirm("确定删除这门课程吗？相关作业、复习任务和笔记都会被删除。")) return;
    await api(`/api/courses/${id}`, { method: "DELETE" });
    STATE.courses = await api("/api/courses");
    showToast("课程已删除");
    renderDashboard();
}

// ── 作业模态框 ──

function showAddAssignmentModal() {
    const courseOpts = STATE.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    const today = new Date().toISOString().split("T")[0];
    openModal("添加作业", `
        <div class="form-group">
            <label class="form-label">所属课程</label>
            <select class="form-select" id="fCourseId">${courseOpts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">作业标题</label>
            <input class="form-input" id="fTitle" placeholder="如：第三章课后习题">
        </div>
        <div class="form-group">
            <label class="form-label">截止日期</label>
            <input class="form-input" type="date" id="fDueDate" value="${today}">
        </div>
        <div class="form-group">
            <label class="form-label">优先级</label>
            <select class="form-select" id="fPriority">
                <option value="高">高</option>
                <option value="中" selected>中</option>
                <option value="低">低</option>
            </select>
        </div>
    `, async () => {
        const course_id = parseInt($("#fCourseId").value);
        const title = $("#fTitle").value.trim();
        const due_date = $("#fDueDate").value;
        const priority = $("#fPriority").value;
        if (!title || !due_date) { showToast("请填写完整信息", "error"); return; }
        await api("/api/assignments", { method: "POST", body: JSON.stringify({ course_id, title, due_date, priority }) });
        showToast("作业已添加");
        renderAssignments();
    });
}

async function editAssignment(id) {
    const assignments = await api("/api/assignments");
    const a = assignments.find(x => x.id === id);
    if (!a) return;
    const courseOpts = STATE.courses.map(c => `<option value="${c.id}" ${c.id === a.course_id ? 'selected' : ''}>${c.name}</option>`).join("");
    openModal("编辑作业", `
        <div class="form-group">
            <label class="form-label">所属课程</label>
            <select class="form-select" id="fCourseId">${courseOpts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">作业标题</label>
            <input class="form-input" id="fTitle" value="${a.title}">
        </div>
        <div class="form-group">
            <label class="form-label">截止日期</label>
            <input class="form-input" type="date" id="fDueDate" value="${a.due_date}">
        </div>
        <div class="form-group">
            <label class="form-label">优先级</label>
            <select class="form-select" id="fPriority">
                <option value="高" ${a.priority === '高' ? 'selected' : ''}>高</option>
                <option value="中" ${a.priority === '中' ? 'selected' : ''}>中</option>
                <option value="低" ${a.priority === '低' ? 'selected' : ''}>低</option>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">状态</label>
            <select class="form-select" id="fCompleted">
                <option value="0" ${!a.completed ? 'selected' : ''}>未完成</option>
                <option value="1" ${a.completed ? 'selected' : ''}>已完成</option>
            </select>
        </div>
    `, async () => {
        const course_id = parseInt($("#fCourseId").value);
        const title = $("#fTitle").value.trim();
        const due_date = $("#fDueDate").value;
        const priority = $("#fPriority").value;
        const completed = parseInt($("#fCompleted").value);
        if (!title || !due_date) { showToast("请填写完整信息", "error"); return; }
        await api(`/api/assignments/${id}`, { method: "PUT", body: JSON.stringify({ course_id, title, due_date, priority, completed }) });
        showToast("作业已更新");
        renderAssignments();
    });
}

// ── 复习任务模态框 ──

function showAddReviewTaskModal(courseId = null) {
    if (STATE.courses.length === 0) { showToast("请先添加课程", "error"); return; }
    const cid = courseId || STATE.courses[0].id;
    const courseOpts = STATE.courses.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${c.name}</option>`).join("");
    openModal("添加复习任务", `
        <div class="form-group">
            <label class="form-label">所属课程</label>
            <select class="form-select" id="fCourseId">${courseOpts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">任务标题</label>
            <input class="form-input" id="fTitle" placeholder="如：第一章 函数与极限">
        </div>
        <div class="form-group">
            <label class="form-label">章节号（可选）</label>
            <input class="form-input" id="fChapter" placeholder="如：Ch.1">
        </div>
        <div class="form-group">
            <label class="form-label">排序序号</label>
            <input class="form-input" type="number" id="fOrder" value="0">
        </div>
    `, async () => {
        const course_id = parseInt($("#fCourseId").value);
        const title = $("#fTitle").value.trim();
        const chapter = $("#fChapter").value.trim();
        const order_index = parseInt($("#fOrder").value) || 0;
        if (!title) { showToast("请填写任务标题", "error"); return; }
        await api("/api/review-tasks", { method: "POST", body: JSON.stringify({ course_id, title, chapter, order_index }) });
        showToast("复习任务已添加");
        renderReview();
    });
}

async function editReviewTask(id) {
    const tasks = await api("/api/review-tasks");
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const courseOpts = STATE.courses.map(c => `<option value="${c.id}" ${c.id === t.course_id ? 'selected' : ''}>${c.name}</option>`).join("");
    openModal("编辑复习任务", `
        <div class="form-group">
            <label class="form-label">所属课程</label>
            <select class="form-select" id="fCourseId">${courseOpts}</select>
        </div>
        <div class="form-group">
            <label class="form-label">任务标题</label>
            <input class="form-input" id="fTitle" value="${t.title}">
        </div>
        <div class="form-group">
            <label class="form-label">章节号</label>
            <input class="form-input" id="fChapter" value="${t.chapter || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">状态</label>
            <select class="form-select" id="fStatus">
                <option value="not_started" ${t.status === 'not_started' ? 'selected' : ''}>未开始</option>
                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>进行中</option>
                <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>已完成</option>
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">排序序号</label>
            <input class="form-input" type="number" id="fOrder" value="${t.order_index || 0}">
        </div>
    `, async () => {
        const course_id = parseInt($("#fCourseId").value);
        const title = $("#fTitle").value.trim();
        const chapter = $("#fChapter").value.trim();
        const status = $("#fStatus").value;
        const order_index = parseInt($("#fOrder").value) || 0;
        if (!title) { showToast("请填写任务标题", "error"); return; }
        await api(`/api/review-tasks/${id}`, { method: "PUT", body: JSON.stringify({ course_id, title, chapter, status, order_index }) });
        showToast("任务已更新");
        renderReview();
    });
}


// ═══════════════════════════════════════════
//  PDF 导出
// ═══════════════════════════════════════════

function exportStudyPlan() {
    window.open("/api/export/study-plan", "_blank");
}

// ═══════════════════════════════════════════
//  Time Log 页面
// ═══════════════════════════════════════════


// ═══════════════════════════════════════════
//  计时器 + 背景音乐
// ═══════════════════════════════════════════

const TIMER = {
    // 设置
    courseId: null,
    totalSeconds: 0,
    musicTrackId: null,        // null = 无音乐
    note: "",
    // 运行时
    state: "idle",             // idle | running | paused | done
    remainingSec: 0,
    intervalId: null,
    // 音乐
    tracks: [],
    audio: null,               // <audio> 元素
    currentTrackIdx: -1,
    isPlaying: false,
    volume: 80,
    loopMode: false,
    shuffleMode: false,
    // 图表引用
    charts: {},
};

const TIMER_AUDIO = {};  // audio element singleton

function getTimerAudio() {
    if (!TIMER_AUDIO.el) {
        TIMER_AUDIO.el = new Audio();
        TIMER_AUDIO.el.volume = TIMER.volume / 100;
        TIMER_AUDIO.el.addEventListener("ended", onMusicEnded);
        TIMER_AUDIO.el.addEventListener("error", () => { TIMER.isPlaying = false; });
    }
    return TIMER_AUDIO.el;
}

// ── 计时器 Tab 主入口 ──

async function renderTimer() {
    const main = $("#mainContent");
    const courses = STATE.courses;
    // 加载音乐列表
    TIMER.tracks = await api("/api/music");
    const musicOpts = `<option value="">无背景音乐</option>` +
        TIMER.tracks.map(t => `<option value="${t.id}">${t.filename} (${t.duration_sec ? Math.floor(t.duration_sec/60)+':'+String(t.duration_sec%60).padStart(2,'0') : '?'})</option>`).join("");

    if (TIMER.state === "running" || TIMER.state === "paused") {
        return renderTimerActive();
    }
    if (TIMER.state === "done") {
        return renderTimerDone();
    }

    // 设置面板
    const courseOptsHTML = courses.map(c => `<option value="${c.id}" ${TIMER.courseId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");
    main.innerHTML = `
    <div class="page-header">
        <h1 class="page-title">Timer</h1>
        <p class="page-subtitle">专注计时学习</p>
    </div>
    <div class="card">
        <div class="timer-setup">
            <div class="form-group">
                <label class="form-label">科目</label>
                <select class="form-select" id="timerCourse">${courseOptsHTML}</select>
            </div>
            <div class="form-group">
                <label class="form-label">时长</label>
                <div class="timer-duration-btns" id="timerDurationBtns">
                    <button class="timer-duration-btn" data-min="25">25 分钟</button>
                    <button class="timer-duration-btn" data-min="45">45 分钟</button>
                    <button class="timer-duration-btn active" data-min="60">60 分钟</button>
                    <button class="timer-duration-btn" data-min="90">90 分钟</button>
                    <input class="form-input" type="number" id="timerCustomMin" placeholder="自定义分钟" min="1" max="240" style="width:120px;height:36px">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">背景音乐</label>
                <select class="form-select" id="timerMusic">${musicOpts}</select>
            </div>
            <div class="timer-music-section">
                <div class="music-upload-area" id="musicUploadArea"
                     ondragover="event.preventDefault();this.style.borderColor='var(--c-muted)'"
                     ondragleave="this.style.borderColor=''"
                     ondrop="handleMusicDrop(event)">
                    拖拽音频文件到此处上传 (mp3/wav/ogg)
                    <input type="file" id="musicFileInput" accept=".mp3,.wav,.ogg" style="display:none"
                           onchange="handleMusicSelect(event)">
                    <button class="btn btn-ghost btn-sm" onclick="$('#musicFileInput').click()" style="margin-left:6px">选择文件</button>
                </div>
            </div>
            <div class="music-track-list" id="musicTrackList">
                ${TIMER.tracks.map(t => `
                <div class="music-track-item">
                    <span>🎵</span>
                    <span class="track-name">${t.filename}</span>
                    <span class="track-duration">${t.duration_sec ? Math.floor(t.duration_sec/60)+':'+String(t.duration_sec%60).padStart(2,'0') : '?'}</span>
                    <button class="btn-icon btn-danger" onclick="deleteMusicTrack(${t.id})">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>`).join("")}
            </div>
            <div class="form-group">
                <label class="form-label">备注（选填）</label>
                <input class="form-input" id="timerNote" placeholder="学习内容...">
            </div>
            <button class="btn btn-primary" style="height:40px;padding:0 32px;font-size:15px"
                    onclick="startTimer()">开始学习</button>
        </div>
    </div>
    <div class="timer-stats" id="timerStatsContainer">
        <div class="timer-stats-grid"></div>
    </div>`;

    // 加载统计图表
    setTimeout(() => renderTimerStats(), 200);

    // 绑定时长按钮事件
    $$("#timerDurationBtns .timer-duration-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            $$("#timerDurationBtns .timer-duration-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const customInput = $("#timerCustomMin");
            if (customInput) customInput.value = "";
        });
    });
    // 自定义输入时取消按钮选中
    const customInput = $("#timerCustomMin");
    if (customInput) {
        customInput.addEventListener("input", () => {
            $$("#timerDurationBtns .timer-duration-btn").forEach(b => b.classList.remove("active"));
        });
    }

    // 停止音乐（如果之前在播放）
    stopMusic();
}

// ── 获取设置面板的时长 ──

function getTimerMinutes() {
    const activeBtn = document.querySelector("#timerDurationBtns .timer-duration-btn.active");
    if (activeBtn) return parseInt(activeBtn.dataset.min);
    const customInput = $("#timerCustomMin");
    const val = customInput ? parseInt(customInput.value) : 0;
    return val > 0 ? val : 60;
}

// ── 开始计时 ──

function startTimer() {
    const courseSelect = $("#timerCourse");
    const musicSelect = $("#timerMusic");
    const noteInput = $("#timerNote");

    TIMER.courseId = courseSelect ? parseInt(courseSelect.value) : (STATE.courses[0]?.id || null);
    if (!TIMER.courseId) { showToast("请先添加课程", "error"); return; }
    TIMER.totalSeconds = getTimerMinutes() * 60;
    TIMER.musicTrackId = musicSelect ? (musicSelect.value || null) : null;
    if (TIMER.musicTrackId) TIMER.musicTrackId = parseInt(TIMER.musicTrackId);
    TIMER.note = noteInput ? noteInput.value.trim() : "";
    TIMER.remainingSec = TIMER.totalSeconds;
    TIMER.state = "running";

    // 启动背景音乐
    if (TIMER.musicTrackId) {
        playMusicById(TIMER.musicTrackId);
    }

    // 请求通知权限
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    TIMER.intervalId = setInterval(timerTick, 1000);
    renderTimerActive();
}

// ── 倒计时中 ──

function renderTimerActive() {
    const main = $("#mainContent");
    const course = STATE.courses.find(c => c.id === TIMER.courseId);
    const courseColor = course ? course.color : "#3b82f6";
    const pct = TIMER.remainingSec / TIMER.totalSeconds;
    const mins = Math.floor(TIMER.remainingSec / 60);
    const secs = TIMER.remainingSec % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    // SVG 进度环
    const r = 110, circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    const svgHTML = `
    <svg viewBox="0 0 260 260">
        <circle cx="130" cy="130" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="12"/>
        <circle cx="130" cy="130" r="${r}" fill="none" stroke="${courseColor}" stroke-width="12"
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 130 130)"
                style="transition: stroke-dashoffset 1s linear"/>
    </svg>`;

    // 音乐播放器
    let musicHTML = "";
    if (TIMER.musicTrackId) {
        const track = TIMER.tracks.find(t => t.id == TIMER.musicTrackId);
        if (track) {
            musicHTML = `
            <div class="music-player">
                <button class="music-player-btn" onclick="toggleMusicPlay()" id="musicPlayBtn">
                    ${TIMER.isPlaying ? "⏸" : "▶"}
                </button>
                <div class="music-player-info">
                    <div class="music-player-title">${track.filename}</div>
                </div>
                <div class="music-player-volume">
                    <span>🔊</span>
                    <input type="range" min="0" max="100" value="${TIMER.volume}"
                           oninput="setMusicVolume(this.value)">
                </div>
                <button class="music-player-btn ${TIMER.loopMode ? 'active' : ''}"
                        onclick="toggleLoopMode()" title="循环">🔁</button>
                <button class="music-player-btn ${TIMER.shuffleMode ? 'active' : ''}"
                        onclick="toggleShuffleMode()" title="随机">🔀</button>
            </div>`;
        }
    }

    main.innerHTML = `
    <div class="timer-active">
        <div class="timer-ring-wrap">
            ${svgHTML}
            <div class="timer-time-left">${timeStr}</div>
        </div>
        <div class="timer-course-name">${course ? course.name : ''}</div>
        ${musicHTML}
        <div class="timer-actions">
            <button class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.2)"
                    onclick="${TIMER.state === 'paused' ? 'resumeTimer()' : 'pauseTimer()'}">
                ${TIMER.state === 'paused' ? '继续' : '暂停'}
            </button>
            <button class="btn btn-ghost" style="color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.1)"
                    onclick="abandonTimer()">放弃</button>
        </div>
    </div>`;
}

function timerTick() {
    TIMER.remainingSec--;
    if (TIMER.remainingSec <= 0) {
        timerComplete();
        return;
    }
    // 更新 UI（优化：只更新时间和环）
    const timeEl = document.querySelector(".timer-time-left");
    if (timeEl) {
        const m = Math.floor(TIMER.remainingSec / 60);
        const s = TIMER.remainingSec % 60;
        timeEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    const circle = document.querySelector(".timer-active circle:nth-child(2)");
    if (circle) {
        const pct = TIMER.remainingSec / TIMER.totalSeconds;
        const r = 110, circ = 2 * Math.PI * r;
        circle.style.strokeDashoffset = circ * (1 - pct);
    }
}

function pauseTimer() {
    TIMER.state = "paused";
    clearInterval(TIMER.intervalId);
    TIMER.intervalId = null;
    renderTimerActive();
}

function resumeTimer() {
    TIMER.state = "running";
    TIMER.intervalId = setInterval(timerTick, 1000);
    renderTimerActive();
}

// ── 完成 ──

async function timerComplete() {
    clearInterval(TIMER.intervalId);
    TIMER.intervalId = null;
    TIMER.state = "done";
    stopMusic();

    // 写入 time_log（时长换算为小时，保留 2 位小数）
    const hours = Math.round(TIMER.totalSeconds / 36) / 100;
    const today = new Date().toISOString().split("T")[0];
    try {
        await api("/api/time-logs", {
            method: "POST",
            body: JSON.stringify({
                course_id: TIMER.courseId,
                date: today,
                hours: hours,
                note: TIMER.note || "",
            }),
        });
    } catch (e) { /* 记录失败不阻塞 */ }

    // 浏览器通知
    if ("Notification" in window && Notification.permission === "granted") {
        const course = STATE.courses.find(c => c.id === TIMER.courseId);
        new Notification("✅ 专注完成！", {
            body: `${course ? course.name : ''} · ${TIMER.totalSeconds / 60} 分钟`,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✅</text></svg>",
        });
    }

    renderTimerDone();
}

function renderTimerDone() {
    const main = $("#mainContent");
    const course = STATE.courses.find(c => c.id === TIMER.courseId);
    main.innerHTML = `
    <div class="timer-complete">
        <div class="timer-complete-icon">✅</div>
        <div class="timer-complete-text">专注完成！</div>
        <div class="timer-complete-sub">
            ${course ? course.name : ''} · ${TIMER.totalSeconds / 60} 分钟 · 已自动记录
        </div>
        <div class="timer-complete-actions">
            <button class="btn btn-primary" onclick="resetTimer()">再来一次</button>
        </div>
        <div class="timer-stats" id="timerStatsContainer">
            <div class="timer-stats-grid"></div>
        </div>
    </div>`;

    setTimeout(() => renderTimerStats(), 200);
}

async function showTimerStats() {
    await renderTimerStats();
    const el = $("#timerStatsContainer");
    if (el) el.scrollIntoView({ behavior: "smooth" });
}

function resetTimer() {
    TIMER.state = "idle";
    TIMER.remainingSec = 0;
    stopMusic();
    renderTimer();
}

function abandonTimer() {
    if (!confirm("确定放弃本次计时吗？不会记录学习时间。")) return;
    clearInterval(TIMER.intervalId);
    TIMER.intervalId = null;
    TIMER.state = "idle";
    stopMusic();
    renderTimer();
}

// ── 统计图表 ──

async function renderTimerStats() {
    const container = $("#timerStatsContainer");
    if (!container) {
        const main = $("#mainContent");
        const div = document.createElement("div");
        div.className = "timer-stats";
        div.id = "timerStatsContainer";
        div.innerHTML = '<div class="timer-stats-grid"></div>';
        main.appendChild(div);
    }
    const grid = document.querySelector("#timerStatsContainer .timer-stats-grid");
    if (!grid) return;

    // 销毁旧图表
    for (const key of Object.keys(TIMER.charts)) {
        if (TIMER.charts[key]) { TIMER.charts[key].destroy(); TIMER.charts[key] = null; }
    }
    // 清空旧卡片
    grid.innerHTML = "";

    const stats = await api("/api/time-logs/stats");
    if (!stats) return;

    // 1. 今日各科横条图
    if (stats.today && stats.today.length > 0) {
        const canvasId = "chartToday";
        grid.innerHTML += `<div class="chart-card"><div style="font-weight:600;margin-bottom:12px">📊 今日各科</div><canvas id="${canvasId}"></canvas></div>`;
        setTimeout(() => {
            const ctx = document.getElementById(canvasId);
            if (ctx) {
                TIMER.charts.today = new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels: stats.today.map(d => d.name),
                        datasets: [{
                            data: stats.today.map(d => d.total_hours),
                            backgroundColor: stats.today.map(d => d.color || "#3b82f6"),
                            borderRadius: 4,
                        }],
                    },
                    options: {
                        indexAxis: "y",
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { x: { title: { display: true, text: "小时" }, beginAtZero: true } },
                    },
                });
            }
        }, 100);
    }

    // 2. 本周柱状图
    if (stats.week && stats.week.labels.length > 0) {
        const canvasId = "chartWeek";
        const weekData = stats.week.labels.map(day => {
            const found = stats.week.data.find(d => d.date === day);
            return found ? found.total_hours : 0;
        });
        const dayNames = stats.week.labels.map(d => {
            const dayNum = new Date(d + "T00:00:00").getDay();
            return ["日","一","二","三","四","五","六"][dayNum];
        });
        grid.innerHTML += `<div class="chart-card"><div style="font-weight:600;margin-bottom:12px">📈 本周每日</div><canvas id="${canvasId}"></canvas></div>`;
        setTimeout(() => {
            const ctx = document.getElementById(canvasId);
            if (ctx) {
                TIMER.charts.week = new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels: stats.week.labels.map((d, i) => `周${dayNames[i]}`),
                        datasets: [{
                            label: "小时",
                            data: weekData,
                            backgroundColor: "#3b82f6",
                            borderRadius: 4,
                        }],
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, title: { display: true, text: "小时" } } },
                    },
                });
            }
        }, 100);
    }

    // 3. 本月折线图
    if (stats.month && stats.month.labels.length > 0) {
        const canvasId = "chartMonth";
        const monthData = stats.month.labels.map(day => {
            const found = stats.month.data.find(d => d.date === day);
            return found ? found.total_hours : 0;
        });
        grid.innerHTML += `<div class="chart-card"><div style="font-weight:600;margin-bottom:12px">📉 本月趋势</div><canvas id="${canvasId}"></canvas></div>`;
        setTimeout(() => {
            const ctx = document.getElementById(canvasId);
            if (ctx) {
                TIMER.charts.month = new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: stats.month.labels.map(d => d.slice(5)),
                        datasets: [{
                            label: "小时",
                            data: monthData,
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59,130,246,.1)",
                            fill: true,
                            tension: 0.3,
                            pointRadius: 2,
                        }],
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, title: { display: true, text: "小时" } } },
                    },
                });
            }
        }, 100);
    }

    if (!grid.innerHTML.trim()) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📊</div><div class="empty-state-text">还没有学习数据，完成一次计时后这里会显示统计图表</div></div>`;
    }
}

// ── 音乐播放控制 ──

function playMusicById(trackId) {
    const track = TIMER.tracks.find(t => t.id == trackId);
    if (!track) return;
    const audio = getTimerAudio();
    audio.src = `/static/uploads/music/${track.filepath}`;
    audio.play().then(() => { TIMER.isPlaying = true; }).catch(() => {});
    TIMER.currentTrackIdx = TIMER.tracks.indexOf(track);
    updateMusicPlayBtn();
}

function toggleMusicPlay() {
    const audio = getTimerAudio();
    if (TIMER.isPlaying) {
        audio.pause();
        TIMER.isPlaying = false;
    } else {
        if (!audio.src && TIMER.musicTrackId) {
            playMusicById(TIMER.musicTrackId);
            return;
        }
        audio.play().then(() => { TIMER.isPlaying = true; }).catch(() => {});
    }
    updateMusicPlayBtn();
}

function updateMusicPlayBtn() {
    const btn = $("#musicPlayBtn");
    if (btn) btn.textContent = TIMER.isPlaying ? "⏸" : "▶";
}

function setMusicVolume(val) {
    TIMER.volume = parseInt(val);
    getTimerAudio().volume = TIMER.volume / 100;
}

function toggleLoopMode() {
    TIMER.loopMode = !TIMER.loopMode;
    getTimerAudio().loop = TIMER.loopMode;
    const btn = document.querySelector(".music-player-btn:nth-child(4)");
    if (btn) btn.classList.toggle("active", TIMER.loopMode);
}

function toggleShuffleMode() {
    TIMER.shuffleMode = !TIMER.shuffleMode;
    const btn = document.querySelector(".music-player-btn:nth-child(5)");
    if (btn) btn.classList.toggle("active", TIMER.shuffleMode);
}

function onMusicEnded() {
    if (TIMER.loopMode) {
        getTimerAudio().play().catch(() => {});
        return;
    }
    if (TIMER.shuffleMode && TIMER.tracks.length > 1) {
        let nextIdx;
        do { nextIdx = Math.floor(Math.random() * TIMER.tracks.length); }
        while (nextIdx === TIMER.currentTrackIdx && TIMER.tracks.length > 1);
        playMusicById(TIMER.tracks[nextIdx].id);
        return;
    }
    TIMER.isPlaying = false;
    updateMusicPlayBtn();
}

function stopMusic() {
    const audio = getTimerAudio();
    audio.pause();
    audio.src = "";
    TIMER.isPlaying = false;
    updateMusicPlayBtn();
}

// ── 音乐上传 ──

async function handleMusicDrop(event) {
    event.preventDefault();
    event.target.style.borderColor = "";
    for (const f of event.dataTransfer.files) uploadMusicFile(f);
}

async function handleMusicSelect(event) {
    for (const f of event.target.files) uploadMusicFile(f);
    event.target.value = "";
}

async function uploadMusicFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["mp3", "wav", "ogg"].includes(ext)) { showToast("仅支持 mp3/wav/ogg", "error"); return; }
    if (file.size > 50 * 1024 * 1024) { showToast("文件不能超过 50MB", "error"); return; }
    const fd = new FormData();
    fd.append("file", file);
    try {
        const res = await fetch("/api/music/upload", { method: "POST", body: fd });
        if (!res.ok) { const e = await res.json(); showToast(e.error || "上传失败", "error"); return; }
        showToast("音乐已上传");
        TIMER.tracks = await api("/api/music");
        if (TIMER.state === "idle") renderTimer();
    } catch (e) { showToast("上传失败", "error"); }
}

async function deleteMusicTrack(id) {
    if (!confirm("确定删除这个曲目吗？")) return;
    await api(`/api/music/${id}`, { method: "DELETE" });
    showToast("曲目已删除");
    TIMER.tracks = await api("/api/music");
    if (TIMER.musicTrackId == id) { TIMER.musicTrackId = null; stopMusic(); }
    if (TIMER.state === "idle") renderTimer();
}

// ── 快速启动 Modal ──

function openQuickTimer() {
    const overlay = $("#quickTimerOverlay");
    if (!overlay) return;
    const select = $("#qtCourse");
    if (select) {
        select.innerHTML = STATE.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    }
    const customInput = $("#qtCustomMin");
    if (customInput) customInput.value = "";
    overlay.classList.add("active");
}

function closeQuickTimer(event) {
    if (event && event.target !== $("#quickTimerOverlay")) return;
    const overlay = $("#quickTimerOverlay");
    if (overlay) overlay.classList.remove("active");
}

function setQuickDuration(min) {
    const customInput = $("#qtCustomMin");
    if (customInput) customInput.value = min;
}

function startQuickTimer() {
    const select = $("#qtCourse");
    const customInput = $("#qtCustomMin");
    const minutes = customInput ? parseInt(customInput.value) || 60 : 60;
    const courseId = select ? parseInt(select.value) : (STATE.courses[0]?.id || null);
    if (!courseId) { showToast("请先添加课程", "error"); return; }

    TIMER.courseId = courseId;
    TIMER.totalSeconds = minutes * 60;
    TIMER.musicTrackId = null;
    TIMER.note = "";
    TIMER.remainingSec = TIMER.totalSeconds;
    TIMER.state = "running";

    closeQuickTimer();
    switchTab("timer");

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    TIMER.intervalId = setInterval(timerTick, 1000);
}

// ═══════════════════════════════════════════
//  AI 聊天
// ═══════════════════════════════════════════

const CHAT = {
    open: false,
    messages: [],  // 完整对话历史
    loading: false,
};

function toggleChat() {
    CHAT.open = !CHAT.open;
    $("#chatPanel").classList.toggle("open", CHAT.open);
    if (CHAT.open) {
        $("#chatInput").focus();
        // 滚动到底部
        const msgEl = $("#chatMessages");
        setTimeout(() => { msgEl.scrollTop = msgEl.scrollHeight; }, 100);
    }
}

function handleChatKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = $("#chatInput");
    const text = input.value.trim();
    if (!text || CHAT.loading) return;
    input.value = "";
    input.style.height = "auto";

    // 添加到历史和 UI
    CHAT.messages.push({ role: "user", content: text });
    appendChatBubble("user", text);

    // 显示加载动画
    CHAT.loading = true;
    const loadingEl = document.createElement("div");
    loadingEl.className = "chat-msg chat-msg-ai";
    loadingEl.id = "chatLoading";
    loadingEl.innerHTML = '<div class="chat-loading"><span></span><span></span><span></span></div>';
    $("#chatMessages").appendChild(loadingEl);
    scrollChatBottom();

    try {
        const res = await api("/api/chat", {
            method: "POST",
            body: JSON.stringify({ messages: CHAT.messages }),
        });
        // 移除加载动画
        loadingEl.remove();
        CHAT.loading = false;
        // 添加 AI 回复
        CHAT.messages.push({ role: "assistant", content: res.reply });
        appendChatBubble("ai", res.reply);
    } catch (err) {
        loadingEl.remove();
        CHAT.loading = false;
        appendChatBubble("ai", "抱歉，出了点问题 😢 请稍后再试。");
    }
}

function appendChatBubble(role, text) {
    const msgEl = document.createElement("div");
    msgEl.className = `chat-msg chat-msg-${role}`;
    const contentEl = document.createElement("div");
    contentEl.className = "chat-msg-content";
    // 使用 marked.js 渲染 Markdown
    if (typeof marked !== "undefined") {
        contentEl.innerHTML = marked.parse(text);
    } else {
        contentEl.textContent = text;
    }
    msgEl.appendChild(contentEl);
    $("#chatMessages").appendChild(msgEl);
    scrollChatBottom();
    // 隐藏提示
    $("#chatHints").style.display = "none";
}

function scrollChatBottom() {
    const msgEl = $("#chatMessages");
    setTimeout(() => { msgEl.scrollTop = msgEl.scrollHeight; }, 50);
}

// 点击提示语句发送
document.addEventListener("click", (e) => {
    if (e.target.closest(".chat-hints span")) {
        const text = e.target.textContent.trim();
        $("#chatInput").value = text;
        sendChatMessage();
    }
});

// ═══════════════════════════════════════════
//  课程管理（在 Dashboard 或独立位置）
// ═══════════════════════════════════════════

// 暴露到全局，便于在控制台调试
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.toggleAssignment = toggleAssignment;
window.deleteAssignment = deleteAssignment;
window.editAssignment = editAssignment;
window.cycleReviewStatus = cycleReviewStatus;
window.deleteReviewTask = deleteReviewTask;
window.selectNotesCourse = selectNotesCourse;
window.addNotesChapter = addNotesChapter;
window.deleteNotesChapter = deleteNotesChapter;
window.openChapterEditor = openChapterEditor;
window.goBackToChapters = goBackToChapters;
window.onNoteInput = onNoteInput;
window.handleTabKey = handleTabKey;
window.syncScroll = syncScroll;
window.doAutoSave = doAutoSave;
window.handlePdfDrop = handlePdfDrop;
window.handlePdfSelect = handlePdfSelect;
window.deletePdf = deletePdf;
window.searchNotes = searchNotes;
window.showAddCourseModal = showAddCourseModal;
window.showEditCourseModal = showEditCourseModal;
window.deleteCourse = deleteCourse;
window.showAddAssignmentModal = showAddAssignmentModal;
window.showAddReviewTaskModal = showAddReviewTaskModal;
window.editReviewTask = editReviewTask;
window.closeModal = closeModal;
window.submitModal = submitModal;
window.exportStudyPlan = exportStudyPlan;
window.toggleChat = toggleChat;
window.handleChatKey = handleChatKey;
window.sendChatMessage = sendChatMessage;
window.renderAssignments = renderAssignments;
window.renderTimer = renderTimer;
window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resumeTimer = resumeTimer;
window.abandonTimer = abandonTimer;
window.resetTimer = resetTimer;
window.showTimerStats = showTimerStats;
window.toggleMusicPlay = toggleMusicPlay;
window.setMusicVolume = setMusicVolume;
window.toggleLoopMode = toggleLoopMode;
window.toggleShuffleMode = toggleShuffleMode;
window.handleMusicDrop = handleMusicDrop;
window.handleMusicSelect = handleMusicSelect;
window.deleteMusicTrack = deleteMusicTrack;
window.openQuickTimer = openQuickTimer;
window.closeQuickTimer = closeQuickTimer;
window.setQuickDuration = setQuickDuration;
window.startQuickTimer = startQuickTimer;


// ═══════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", init);

// 键盘快捷键
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "Escape") closeModal();
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case "1": e.preventDefault(); switchTab("dashboard"); break;
            case "2": e.preventDefault(); switchTab("courses"); break;
            case "3": e.preventDefault(); switchTab("assignments"); break;
            case "4": e.preventDefault(); switchTab("review"); break;
            case "5": e.preventDefault(); switchTab("notes"); break;
            case "6": e.preventDefault(); switchTab("timer"); break;
        }
    }
});