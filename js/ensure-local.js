(function () {
  if (location.protocol !== "file:") return;
  var parts = location.pathname.split(/[\\/]/);
  var page = decodeURIComponent(parts[parts.length - 1] || "invoice.html");
  if (!/\.html$/i.test(page)) page = "invoice.html";
  location.replace("http://127.0.0.1:5500/" + page + location.search + location.hash);
})();
