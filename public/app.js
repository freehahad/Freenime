const grid = document.getElementById("grid");
const search = document.getElementById("search");
const count = document.getElementById("count");
const empty = document.getElementById("empty");
let videos = [];

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function render() {
  const q = search.value.trim().toLowerCase();
  const shown = videos.filter(v => v.title.toLowerCase().includes(q));
  grid.innerHTML = "";
  count.textContent = shown.length + (shown.length === 1 ? " video" : " videos");
  empty.hidden = shown.length !== 0;

  shown.forEach(v => {
    const card = document.createElement("a");
    card.className = "card";
    card.href = "/watch.html?id=" + v.id;
    card.innerHTML =
      '<div class="thumb"><span>▶</span></div>' +
      '<div class="card-body"><h3>' + escapeHtml(v.title) +
      '</h3><p>Watch now</p></div>';
    grid.appendChild(card);
  });
}

async function load() {
  videos = await fetch("/api/videos").then(r => r.json());
  render();
}
search.addEventListener("input", render);
load();
