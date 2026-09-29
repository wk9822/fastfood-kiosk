// Simple fade-in / fade-out page transitions using Tailwind utility classes
(function () {
    function applyInitialFadeIn() {
        const body = document.body;
        if (!body) return;
        body.classList.add('transition-opacity', 'duration-300', 'ease-out');
        body.classList.add('opacity-0');
        // Use RAF to ensure the class change happens in a separate frame
        requestAnimationFrame(function () {
            body.classList.add('opacity-100');
            body.classList.remove('opacity-0');
        });
    }

    window.navigateWithFade = function (url) {
        const body = document.body;
        if (!body) {
            window.location.href = url;
            return;
        }
        body.classList.add('transition-opacity', 'duration-200', 'ease-in');
        body.classList.remove('opacity-100');
        body.classList.add('opacity-0');
        setTimeout(function () {
            window.location.href = url;
        }, 180);
    };

    document.addEventListener('DOMContentLoaded', applyInitialFadeIn);
})();

