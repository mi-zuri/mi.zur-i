document.addEventListener("DOMContentLoaded", setStyleOnLoad);
document.fonts.ready.then(() => document.body.classList.add("fonts-loaded"));

function setStyleOnLoad(){
    if(localStorage.getItem('dark-mode') == null){
        localStorage.setItem("dark-mode", "0");
    } else if (localStorage.getItem('dark-mode') === "1") {
        darkModeOn();
    }
}

function toggleStyle() {
    if (localStorage.getItem('dark-mode') === "0") {
        darkModeOn();
    } else {
        darkModeOff();
    }
}

function darkModeOn() {
    document.querySelector(':root').style.setProperty('--bg-primary', '#1c1c1c');
    document.getElementById("dark-mode").innerHTML = "light-mode";
    let nodeList = document.querySelectorAll("input[type=text], input[type=email], select, textarea");
    for (let i = 0; i < nodeList.length; i++) {
        nodeList[i].style.backgroundColor = "var(--bg-primary)";
        nodeList[i].style.color = "#c7c7c7";
    }
    localStorage.setItem("dark-mode", "1");
}

function darkModeOff() {
    document.querySelector(':root').style.setProperty('--bg-primary', '#c7c7c7');
    document.getElementById("dark-mode").innerHTML = "night-mode";
    let nodeList = document.querySelectorAll("input[type=text], input[type=email], select, textarea");
    for (let i = 0; i < nodeList.length; i++) {
        nodeList[i].style.backgroundColor = "white";
        nodeList[i].style.color = "black";
    }
    localStorage.setItem("dark-mode", "0");
}