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

		var props = JSON.parse(window.localStorage.getItem('properties'));
		send('server', 'properties', props);
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
		}, 100);
	});
}

connect();

function setProperty(property, value) {
	let data = {};
	data[property] = metadata.properties[metadata.index][property] = value;

	send('server', 'properties', data);

	var props = JSON.stringify(metadata.properties[metadata.index]);
	window.localStorage.setItem('properties', props);
}

function getProperty(from, property, fallback) {
	return from in metadata.properties && property in metadata.properties[from] ? metadata.properties[from][property] : fallback;
}

function send(to, type, data) {
	var message = {
		to: to,
		packet: {
			type: type
		}
	};

	message['packet'][type] = data;
	socket.send(JSON.stringify(message));
}

function handlePacket(from, type, data) {
	switch (type) {
		case 'metadata':
			if (metadata.version !== undefined && data.version !== metadata.version)
				window.location.reload(true);

			metadata = data;
			document.getElementById('debug').textContent = JSON.stringify(data, undefined, '    ');
			break;

		case 'chat':
			/**
			 * <div class="message">
			 <div class="username">Test gebruiker</div>
			 <div class="content">Test</div>
			 </div>
			 */

			var message = document.createElement('div');
			message.classList.add('message');

			if (from === metadata.index)
				message.classList.add('self');

			var username = document.createElement('div');
			username.classList.add('username');
			username.textContent = getProperty(from, 'name', 'Unknown user (' + from.substr(0, 6) + ')');
			message.appendChild(username);

			var content = document.createElement('div');
			content.classList.add('content');
			content.textContent = data.msg;
			message.appendChild(content);

			document.getElementById('messages').appendChild(message);
			break;
	}
}