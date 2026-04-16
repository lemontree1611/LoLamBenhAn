(function () {
  var root = document.documentElement;
  var done = false;
  root.classList.add("form-enter");

  function activate() {
    if (done) return;
    done = true;
    root.classList.add("form-enter-active");
  }

  function start() {
    if (document.readyState === "complete") {
      requestAnimationFrame(function () {
        requestAnimationFrame(activate);
      });
      return;
    }

    window.addEventListener("load", function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(activate);
      });
    }, { once: true });

    setTimeout(activate, 2500);
  }

  start();
})();
