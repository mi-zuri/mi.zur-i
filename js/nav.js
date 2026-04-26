(function () {
    const path = window.location.pathname;
    const file = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    const isHome = file === "" || file === "index.html";

    const homeNavItems = [
        { href: "#pillars",  name: "explore" },
        { href: "#timeline", name: "timeline" },
        { href: "#about",    name: "about" },
        { href: "#contact",  name: "contact" }
    ];

    const detailNavItems = [
        { href: "index.html",         name: "home" },
        { href: "music.html",         name: "music" },
        { href: "tech.html",          name: "tech" },
        { href: "index.html#about",   name: "about" },
        { href: "index.html#contact", name: "contact" }
    ];

    const navItems = isHome ? homeNavItems : detailNavItems;
    const currentName = file.replace(".html", "");

    const navItemsHTML = navItems.map(item => {
        const itemName = item.name.replace(/\s+/g, "-");
        const isActive = !isHome && (itemName === currentName);
        const style = isActive ? "solid" : "regular";
        const dataScroll = isHome ? ` data-scroll="${item.href}"` : "";
        return `        <li class="nav-item">
            <a href="${item.href}" class="nav-link"${dataScroll}>
                <i class="fa fa-${style} fa-heart"></i>
                <span class="link-text">${item.name}</span>
            </a>
        </li>`;
    }).join("\n");

    const headerHTML = `<header id="top">
    <span class="horizontal-line left"></span>
    <div class="logo">
        <p><a href="index.html">mi.zur&#8209;i</a></p>
    </div>
    <span class="horizontal-line right"></span>
</header>
<div class="vertical-line menu-connector"></div>
<nav class="navbar">
    <ul class="navbar-nav">
${navItemsHTML}
        <li class="nav-item">
            <a class="nav-link" onclick="toggleStyle()">
                <i class="fa fa-solid fa-yin-yang"></i>
                <span class="link-text" id="dark-mode">night-mode</span>
            </a>
        </li>
    </ul>
</nav>`;

    const footerHTML = `<footer id="bottom">
    <span class="social-media-nav">
        <a href="https://twitter.com/Michu_Music" target="_blank"><i class="fa fa-brands fa-twitter"></i></a>
    </span>
    <p class="copyright-info">© 2026 BY <a href="#top">MICHAŁ ŻURAWSKI</a></p>
</footer>`;

    const headerSlot = document.getElementById("layout-header");
    if (headerSlot) headerSlot.outerHTML = headerHTML;

    const footerSlot = document.getElementById("layout-footer");
    if (footerSlot) footerSlot.outerHTML = footerHTML;
})();
