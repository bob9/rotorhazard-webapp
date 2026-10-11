/* RotorHazard Web App plugin: adds "New interface" to the classic pages' extended menu.
 * Added to classic pages by the plugin; does nothing inside the web app's plugin page viewer. */
(function () {
	var script = document.currentScript;
	try {
		if (window.self !== window.top && window.top.location.pathname.indexOf('/app/') === 0) return;
	} catch (e) { /* cross-origin parent: a classic page on its own */ }

	function add() {
		var menu = document.querySelector('#nav-main li.extra > ul');
		if (menu && !menu.querySelector('.rh-webapp-link')) {
			var li = document.createElement('li');
			li.className = 'rh-webapp-link';
			var a = document.createElement('a');
			// the server opens the app's page for this one (known pages only)
			a.href = '/interface/app?to=' + encodeURIComponent(window.location.pathname + window.location.search);
			a.textContent = (script && script.getAttribute('data-label')) || 'New interface';
			li.appendChild(a);
			menu.insertBefore(li, menu.firstChild);
		}
		// the timer name leads to the classic home page, which '/' may not be
		var home = document.getElementById('timer-name');
		if (home && home.getAttribute('href') === '/') home.setAttribute('href', '/classic');
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', add);
	} else {
		add();
	}
})();
