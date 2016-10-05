var server = 'wss://hangout.ndat.nl/ws/';
var socket;
var metadata = {
	index: null,
	indexes: [],
	properties: {}
};
var properties = {};

function connect() {
	socket = new WebSocket(server);

	socket.addEventListener('open', function () {
		console.log('Connection opened');

		var props = JSON.parse(window.localStorage.getItem('properties')) || {};
		send('server', 'properties', props);

		if (!('name' in props)) {
			var name = '';

			while (name === null || name.length < 4)
				name = prompt('Username');

			setProperty('name', name);
		}
	});

	socket.addEventListener('message', function (event) {
		try {
			var json = JSON.parse(event.data);

			json.from = json.from || 'undefined';
			json.type = json.type || 'ping';
			json[json.type] = json[json.type] || {};

			handlePacket(json.from, json.type, json[json.type]);

			console.log('IN', json.type);
		} catch (e) {
			console.error(e);
		}
	});

	socket.addEventListener('close', function (event) {
		console.log('Connection closed');

		setTimeout(function () {
			connect();
		}, 500);
	});
}

connect();

function setProperty(property, value) {
	let data = {};

	if (!(metadata.index in metadata.properties))
		metadata.properties[metadata.index] = {};

	data[property] = metadata.properties[metadata.index][property] = value;

	send('server', 'properties', data);

	var props = JSON.stringify(metadata.properties[metadata.index]);
	window.localStorage.setItem('properties', props);
}

function getProperty(from, property, fallback) {
	return from in metadata.properties && property in metadata.properties[from] ? metadata.properties[from][property] : fallback;
}

function send(to, type, data) {
	if (to === metadata.index || (to[0] === metadata.index && to.length === 1)) {
		console.log('OUT<>IN', type);

		handlePacket(metadata.index, type, data);
		return;
	}

	console.log('OUT', type);

	var message = {
		to: to,
		packet: {
			type: type
		}
	};

	message['packet'][type] = data;
	socket.send(JSON.stringify(message));
}

function addUser(token) {
	var user = document.createElement('div');
	user.classList.add('user');
	user.dataset.token = token;
	user.addEventListener('click', function (token) {
		document.getElementById('message').value = '/tell ' + token + ' ';
		document.getElementById('message').focus();
	}.bind(null, token));

	var name = document.createElement('div');
	name.classList.add('name');
	name.textContent = getProperty(token, 'name', token);
	name.style.color = getProperty(token, 'color', 'black');
	user.appendChild(name);

	var tooltip = document.createElement('div');
	tooltip.classList.add('tooltip');

	Object.keys(metadata.properties[token]).forEach(key => {
		var val = metadata.properties[token][key];
		var prop = document.createElement('div');
		prop.textContent = key + ': ' + val;

		tooltip.appendChild(prop);
	});

	user.appendChild(tooltip);

	document.querySelector('.users').appendChild(user);
}

function removeUser(token) {
	var child = document.querySelector('.user[data-token="' + token + '"]');

	if (child !== null)
		child.parentNode.removeChild(child);
}

function sendMessage(message) {
	message = message.trim();

	if (message.length < 1) {
		handlePacket('local', 'chat', {type: 'service', text: 'Message cannot be empty.'});
		return;
	}

	if (message.substr(0, 1) === '/') {
		var parts = message.substr(1).split(' ');

		switch (parts[0].toLowerCase()) {
			case 'set':
				setProperty(parts[1] || null, parts.slice(2).join(' ') || null);
				break;

			case 'img':
				send('*', 'chat', {type: 'image', src: parts.slice(1).join(' ')});
				break;

			case 'wakeup':
				send('*', 'wakeup', {src: parts.slice(1).join(' ')});
				break;

			case 'code':
				send('*', 'chat', {type: 'code', code: parts.slice(1).join(' ')});
				break;

			case 'send':
				send('*', parts[1] || null, JSON.parse(parts.slice(2).join(' ')));
				break;

			case 'tell':
				send([parts[1] || null, metadata.index], 'chat', {type: 'text', message: parts.slice(2).join(' ')});
				break;

			default:
				handlePacket('local', 'chat', {type: 'service', text: 'Unknown command ' + parts[0] + '.'});
				break;
		}
	} else {
		send('*', 'chat', {type: 'text', message: message});
	}
}

function handlePacket(from, type, data) {
	switch (type) {
		case 'metadata':
			if (metadata.version !== undefined && data.version !== metadata.version)
				window.location.reload(true);

			metadata = data;
			metadata.indexes.forEach(token => removeUser(token));
			metadata.indexes.forEach(token => addUser(token));
			break;

		case 'changes':
			data.closed.forEach(token => removeUser(token));
			break;

		case 'wakeup':
			var overlay = document.createElement('div');
			overlay.classList.add('overlay');
			overlay.addEventListener('click', function (overlay) {
				document.body.removeChild(overlay);
			}.bind(null, overlay));

			var img = document.createElement('img');
			img.src = data.src || '';
			img.addEventListener('click', function (overlay) {
			document.body.removeChild(overlay);

			overlay.appendChild(img);

			img.addEventListener('load', function () {
				document.body.appendChild(overlay);

				//setTimeout(function (overlay) {
				//	document.body.removeChild(overlay);
				//}.bind(null, overlay), 3000);
			});
			break;

		case 'chat':
			var messages = document.getElementById('messages');
			var scrollDown = messages.scrollTop === 0 || messages.scrollTop >= messages.scrollHeight - messages.offsetHeight - 10;

			var message = document.createElement('div');
			message.classList.add('message');

			if (from === metadata.index)
				message.classList.add('self');

			if (from !== 'local') {
				var username = document.createElement('div');
				username.classList.add('username');
				username.style.color = getProperty(from, 'color', 'black');
				username.textContent = getProperty(from, 'name', 'Unknown user (' + from.substr(0, 6) + ')');
				message.appendChild(username);
			}

			var content;

			switch (data.type || null) {
				case 'text':
					content = document.createElement('div');
					content.classList.add('content');
					content.textContent = data.message;

					var regex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})([^#]*)/gmi;
					var match;
					var html = content.innerHTML;
					while ((match = regex.exec(content.textContent)) !== null)
						html = html.replace(match[0], '<span style="color: #' + match[1] + ';">' + match[2] + '</span>');

					var urlPattern = /\b(?:https?|ftp):\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gim;
					var pseudoUrlPattern = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
					var emailAddressPattern = /[\w.]+@[a-zA-Z_-]+?(?:\.[a-zA-Z]{2,6})+/gim;

					html = html.replace(urlPattern, '<a target="_blank" href="$&">$&</a>').replace(pseudoUrlPattern, '$1<a target="_blank" href="http://$2">$2</a>').replace(emailAddressPattern, '<a target="_blank" href="mailto:$&">$&</a>');

					content.innerHTML = html;
					break;

				case 'image':
					content = document.createElement('img');
					content.classList.add('content');
					content.src = data.src || '';
					content.addEventListener('load', function () {
						if (scrollDown)
							messages.scrollTop = messages.scrollHeight;
					});
					break;

				case 'code':
					content = document.createElement('pre');
					content.classList.add('content');
					content.textContent = data.code || '';
					break;

				case 'service':
					if (from !== 'local')
						break;

					message.classList.add('service');

					content = document.createElement('div');
					content.classList.add('content');
					content.textContent = data.text || '';
					break;

				default:
					content = document.createElement('div');
					content.classList.add('content');
					content.classList.add('unknown');

					content.textContent = 'Unsupported content type';
					break;
			}

			message.appendChild(content);
			messages.appendChild(message);

			if (scrollDown)
				messages.scrollTop = messages.scrollHeight;

			break;
	}
}