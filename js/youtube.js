let image = document.getElementsByClassName("youtube")[0];
image.onclick = function () {
    let iframe = document.createElement("iframe");
    iframe.setAttribute("src", "https://www.youtube.com/embed/" + this.id + "?autoplay=1&controls=0");
    iframe.style.width = this.style.width;
    iframe.style.height = this.style.height;
    this.parentNode.replaceChild(iframe, this);
}