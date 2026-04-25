(function () {
    const path = window.location.pathname;
    const file = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    const current = file.replace(".html", "");

    const navItems = [
        { href: "about.html", name: "about" },
        { href: "music.html", name: "music" },
        { href: null,         name: "contact" }
    ];

    const navItemsHTML = navItems.map(item => {
        const style = item.name === current ? "solid" : "regular";
        const href = item.href ? `href="${item.href}" ` : "";
        return `        <li class="nav-item">
            <a ${href}class="nav-link">
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
    <p class="copyright-info">© 2022 BY <a href="#top">MICHAŁ ŻURAWSKI</a></p>
</footer>`;

    document.getElementById("layout-header").outerHTML = headerHTML;
    document.getElementById("layout-footer").outerHTML = footerHTML;
})();
