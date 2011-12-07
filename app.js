var fs = require('fs');
var jade = require('jade');
var events = require('events');
var express = require('express');
var app = express.createServer();
var socket = require('socket.io').listen(app);
var config = {
	hdhomerun: {
		bin: 'hdhomerun_config'
	},
	channel: {
		txt: 'channels.txt'
	}	
};
var tv = {};
tv.emmitter = new events.EventEmitter();

var spawn = require('child_process').spawn;

tv.encoder = {
	encode: function(stream) {
		var outputFileName = stream.split('/')[2]+'.mp4';
		var outputPath = 'public/recordings/encoded/'+outputFileName;
		var f = spawn('ffmpeg', ['-i',stream,'-s','810x494','-r','30000/1001','-b','200k','-bt','240k','-vcodec','libx264','-vpre','ipod640','-acodec','libfaac','-ac','2','-ar','48000','-ab','192k','-y',outputPath]);	
		f.stdout.setEncoding('utf8');
		f.stdout.on('data', function(data) {
			console.log(data);
		});
		f.stderr.setEncoding('utf8');
		f.stderr.on('data', function(error) {
			console.log(error);
		});
		f.on('exit', function(code, signal) {
			console.log(code);	
			tv.emmitter.emit('encoded', {video:outputFileName});
		});
	}
}
tv.tuner = {
	init: function(){
		var status = spawn(config.hdhomerun.bin, ['discover']);
		status.stdout.setEncoding('utf8');
		status.stdout.on('data', function(data) {
			//hdhomerun device 1030F062 found at 10.0.1.98
			var successPattern = /(([A-F]|[a-f]|[0-9]){8})/;
			var result = data.match(successPattern);
			if(result){
				tv.tuner.id = result[1];
				console.log(tv.tuner.id);
			}
		});
		status.stderr.setEncoding('utf8');
		status.stderr.on('data', function(error) {
			console.log(error);
		});
		status.on('exit', function(code, signal) {
			if(code==0){
				var channelFile = fs.readFile(config.channel.txt, 'utf8', function(err, data) {
					if(err) throw err;
					var frequencyPattern = /^SCANNING:.*:(\d.*)\)$/
					var signalPattern = /LOCK: \w.* \(ss=(\d.*) snq=(\d.*) seq=(\d.*)\)/;
					var programPattern = /PROGRAM (\d.*): (\w.*\.\w.*)/
					var lines = data.split('\n');
					var channelInfo;
					var signalInfo;
					var programInfo;
					lines.forEach(function(element) {
						var frequency = element.match(frequencyPattern);
						var signal = element.match(signalPattern);
						var program = element.match(programPattern);
						if(frequency){
							channelInfo = parseInt(frequency[1]);
						}
						if(signal){
							signalStrength = parseInt(signal[1]);
							signalNoise = parseInt(signal[2]);
						}
						if(program){
							programInfo = parseInt(program[1]);
							networkInfo = program[2].split(' ');
							virtualChannel = parseFloat(networkInfo[0]);	
							if(networkInfo.length==2){
								callsign = networkInfo[1];
							}
							if(networkInfo.length>2){
								callsign = networkInfo.slice(1,-1).join();
							}
							tv.tuner.channels.push({channel:channelInfo,program:programInfo,virtualChannel:virtualChannel,callsign:callsign,signalStrength:signalStrength,signalNoise:signalNoise});
						}
					});
					tv.tuner.channels.sort(function(a, b) { return a.virtualChannel - b.virtualChannel;});
					tv.tuner.channel = 0;
				});
			}
		});
	},
	set: function(channel,program) {
		console.log('setting channel to ' + channel);
		var c = spawn('hdhomerun_config', [tv.tuner.id,'set','/tuner0/channel',channel]);
		c.stdout.setEncoding('utf8');
		c.stdout.on('data', function(data) {
			console.log(data);
		});
		c.stderr.setEncoding('utf8');
		c.stderr.on('data', function(error) {
			console.log(error);
		});
		c.on('exit', function(code, signal) {
			if(code==0){
				var p = spawn('hdhomerun_config', [tv.tuner.id,'set','/tuner0/program',program]);
				p.stdout.setEncoding('utf8');
				p.stdout.on('data', function(data) {
					console.log(data);
				});
				p.stderr.setEncoding('utf8');
				p.stderr.on('data', function(error) {
					console.log(error);
				});
				p.on('exit', function(code, signal) {
					console.log('program set to ' + program);
				});
			}
		});
	},
	save: function(stream) {
		if(stream!=false){
			console.log('saving the stream');
			var s = spawn(config.hdhomerun.bin, [tv.tuner.id,'save','/tuner0', stream]);
			tv.tuner.status.recording = s;
			s.stdout.setEncoding('utf8');
			s.stdout.on('data', function(data) {
				console.log(data);
			});
			s.stderr.setEncoding('utf8');
			s.stderr.on('data', function(error) {
				console.log(error);
			});
			s.on('exit', function(code, signal) {
				console.log('save exited ' + code);
				console.log(signal);
				console.log('transcoding should start now ' + stream);
				tv.encoder.encode(stream);
			});
	}
	else {
		tv.tuner.status.recording.kill('SIGHUP');
		tv.tuner.status.recording = null;
	}
	},
	id:{
	
	},
	ip:{
	
	},
	channel: {

	},
	channels: [

	],
	status: {
		recording: false
	}
};

tv.tuner.init();
socket.set('log level', 1);
socket.sockets.on('connection', function(client) {
	tv.emmitter.on('encoded', function(data) {
		client.emit('encoded', {encoded:data});
	});
	console.log('connection');
	client.on('encoded', function() {
		client.emit('encoded', {encoded:true});
	});
	client.emit('channel', {channel:tv.tuner.channels[tv.tuner.channel]});
	client.on('record', function(recording) {
		if(!tv.tuner.status.recording){
			var date = new Date().toJSON();
			var stream = 'public/recordings/' + tv.tuner.channels[tv.tuner.channel].callsign + '-' + date + '.mpg';
			tv.tuner.save(stream);
		}
		else {
			tv.tuner.save(false);
		}
	});
	client.on('channelChange', function(direction) {
		if(direction.direction=='up'){
			if(tv.tuner.channel == tv.tuner.channels.length - 1){
				tv.tuner.channel = 0;
			}
			else {
				tv.tuner.channel++;
			}
		}
		if(direction.direction=='down'){
			if(tv.tuner.channel == 0) {
				tv.tuner.channel = tv.tuner.channels.length-1;
			}
			else {
				tv.tuner.channel--;
			}
		}
		tv.tuner.set(tv.tuner.channels[tv.tuner.channel].channel, tv.tuner.channels[tv.tuner.channel].program);
		client.emit('channel', {channel:tv.tuner.channels[tv.tuner.channel]});
	});
});

app.set('view engine', 'jade');
app.listen(9999);
console.log('listening 9999');
app.use(express.static(__dirname + '/public'));
app.get('/app', function(req, res) {
	res.render('index.jade', {layout: false, title: 'WebApp'});
});
app.get('/', function(req, res) {
	res.contentType('application/json');
	res.send(JSON.stringify(tv));
});
app.get('/channel/:channel', function(req,res){
	var channel = req.params.channel;
	tv.tuner.set(channel);
	res.send(tv.tuner.channel);	
});
app.get('/channels', function(req,res) {
	res.send(JSON.stringify(tv.tuner.channels));
});
app.get('/save', function(req,res){
	res.send('saving stream.mpg');
	tv.tuner.save('stream.mpg');
	res.end();
});
