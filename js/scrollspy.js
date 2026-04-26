(function () {
    document.addEventListener("DOMContentLoaded", () => {
        const sections = document.querySelectorAll("[data-section]");
        if (sections.length === 0) return;

        const links = document.querySelectorAll(".nav-link[data-scroll]");
        const linkByHash = {};
        links.forEach(link => {
            linkByHash[link.getAttribute("data-scroll")] = link;
            link.addEventListener("click", e => {
                const target = document.querySelector(link.getAttribute("data-scroll"));
                if (!target) return;
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", link.getAttribute("data-scroll"));
            });
        });

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const id = "#" + entry.target.id;
                Object.values(linkByHash).forEach(l => l.classList.remove("is-active"));
                const link = linkByHash[id];
                if (link) link.classList.add("is-active");
            });
        }, { threshold: 0.55 });

        sections.forEach(s => observer.observe(s));
    });
})();
