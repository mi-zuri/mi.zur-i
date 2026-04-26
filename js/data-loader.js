(function () {
    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        const timelineEl = document.getElementById("timeline-list");
        const projectsEl = document.getElementById("projects-grid");

        if (timelineEl) renderTimeline(timelineEl);
        if (projectsEl) renderProjects(projectsEl);
    }

    async function fetchJSON(path) {
        try {
            const res = await fetch(path, { cache: "no-cache" });
            if (!res.ok) throw new Error(res.status);
            return await res.json();
        } catch (err) {
            console.warn("Failed to load", path, err);
            return [];
        }
    }

    async function renderTimeline(el) {
        const limit = parseInt(el.dataset.limit || "8", 10);
        const [music, projects] = await Promise.all([
            fetchJSON("data/music.json"),
            fetchJSON("data/projects.json")
        ]);

        const items = [
            ...music.map(m => ({ ...m, kind: "music" })),
            ...projects.map(p => ({ ...p, kind: "tech" }))
        ]
            .filter(i => i.date)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, limit);

        el.innerHTML = items.map(i => `
            <a class="timeline-row timeline-${i.kind}" href="${i.url}" target="_blank" rel="noopener">
                <span class="timeline-date">${formatDate(i.date)}</span>
                <span class="timeline-badge">${i.category || i.kind}</span>
                <span class="timeline-title">${escapeHTML(i.title)}</span>
                <span class="timeline-desc">${escapeHTML(i.description || "")}</span>
                <i class="fa fa-solid fa-arrow-up-right-from-square"></i>
            </a>
        `).join("");
    }

    async function renderProjects(el) {
        const projects = await fetchJSON("data/projects.json");
        const sorted = [...projects].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        el.innerHTML = sorted.map(p => `
            <article class="project-card">
                <header class="project-card-head">
                    <h3>${escapeHTML(p.title)}</h3>
                    <span class="project-category">${escapeHTML(p.category || "code")}</span>
                </header>
                <p class="project-desc">${escapeHTML(p.description || "")}</p>
                <footer class="project-card-foot">
                    <span class="project-date">updated ${formatDate(p.date)}</span>
                    <span class="project-links">
                        <a href="${p.url}" target="_blank" rel="noopener" title="repo"><i class="fa fa-brands fa-github"></i></a>
                        ${p.demo ? `<a href="${p.demo}" target="_blank" rel="noopener" title="demo"><i class="fa fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
                    </span>
                </footer>
            </article>
        `).join("");
    }

    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toISOString().slice(0, 10);
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }
})();
