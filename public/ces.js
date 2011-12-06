YUI().use('resize', 'charts', 'overlay', 'node', 'event', 'json', function(Y) {
	var dictionary = {};
	var booleans = ['YES','yes','NO','no'];
	var colors = ['RED','red','GREEN','green','BLUE','blue','YELLOW','yellow','WHITE', 'white','BLACK','black','GRAY', 'gray', 'SILVER', 'silver', 'PURPLE', 'purple','MAROON','maroon','FUCHSIA','fuchsia','LIME','lime','OLIVE','olive','NAVY','navy','TEAL','teal','AQUA','aqua'];
	var stopWords = ['AND', 'and', 'THE','the','IS','is','AT','at','WHICH','which','ON','on','THEY','they','THEY\'RE','they\'re'];
	var socket = io.connect('http://atom',{port:9999});
	socket.on('connection', function(data) {
		console.log('connection');
	});
	socket.on('channel', function(data) {
		console.log(data);
		var channel = data.channel || {};
		Y.one('div#channel h2#virtualChannel').set('innerHTML', channel.virtualChannel);
		Y.one('div#channel h2#callsign').set('innerHTML', channel.callsign);
	});
	socket.on('image', function(data) {
		Y.one("div#middle").setStyle('background-image', 'url(image'+data.image+'.jpg)');
		console.log(data.image);
	});
	socket.on('news', function(data) {
		var pattern = /(\d{2}\:\d{2}\:\d{2}),(\d{3})\W*\|(.*)/;
		var result = data.captions.match(pattern);
		if(result){
			var currentTimeStamp = result[1];
			var captions = result[3];
			var caption = Y.Node.create("<h1></h1>");
			var pattern2 = /.*/;
			var result2 = captions.match(pattern2);
			if(result2) {
				var words = result2[0].split(" "); 
				if(words){
					for(var i=0,len=words.length;i<len;i++){
						if(words[i]){
							var word = Y.Node.create("<span class='word'>"+words[i]+"</span>");
							word.setData('time', currentTimeStamp);
							booleans.forEach(function(element) {
								if(element==words[i]){
									word.addClass('boolean');
								}
							});
							colors.forEach(function(element) {
								if(element==words[i]){
									word.setStyle('color', element.toLowerCase());
									console.log(element.toLowerCase());
								}
							});
							stopWords.forEach(function(element) {
								if(element==words[i]){
									word.addClass('stop');
								}
							});
							caption.insert(word,i);
							if(dictionary.hasOwnProperty(words[i])){
								dictionary[words[i]]++;
							}
							else {
								dictionary[words[i]] = 1;
							}
						}
					}
				}
				Y.one('#captions').prepend(caption);
			}
			var topWordCount = 0;
			var topWord;
			for(var word in dictionary){
				if(dictionary[word] > topWordCount){
					topWord = word;
					topWordCount = dictionary[word];
				}	
			}
			var tw = Y.Node.create("<h3>"+topWord+"</h3>");
			Y.one('#words h3').insert(tw, "replace");
		}

	});

	var chart;
	Y.one('#words').on('click', function(e) {
			if(chart) {
				chart.destroy(true);
			}
			var sortedDictionary = [];
			for(var word in dictionary) {
				sortedDictionary.push([word, dictionary[word]]);
			}		
			sortedDictionary.sort(function(a,b) {return b[1]-a[1]});
			var chartData = [];
			sortedDictionary.slice(0,3).forEach(function(element) {
				chartData.push({category:element[0], value:element[1]});
			});

			chart = new Y.Chart({
				dataProvider: chartData,
				render: '#left',
				type: 'column',
				styles: {
					graph: {
						background: {
							fill: {
								color:'transparent'
							},
							border: {
								color:'transparent',
								weight:'0px'	
							}
						},
					},
				},
				showMarkers: false,
			});
	});
	
	Y.one('#captions').delegate('click', function(e) {
		var timeStamp = e.currentTarget.getData('time');
		console.log(timeStamp);
		console.log(socket);
		socket.emit('timeStamp', {timeStamp: timeStamp});
		
}, 'span');
	
	var resize = new Y.Resize({
		node: '#captions',
		handles: 't,b'
	});
	resize.plug(Y.Plugin.ResizeConstrained, {
		maxHeight:479, 
		minHeight:50
	});
	var recording = false;
	Y.one('body').on('keypress',function(e) {
		var direction;
		var action;
		switch(e.keyCode){
			case 107:
				action = 'channel';
				direction = 'up';
				break;
			case 106: 
				action = 'channel';
				direction = 'down';
				break;
			case 114:
				action = 'record';
				break;
		}
		if(action=='channel'){
			console.log('changing channel ' + direction);
			socket.emit('channelChange', {direction: direction});
		}
		if(action=='record'){
			console.log(recording);
			if(!recording){
				recording = true;	
			}
			else {
				recording = false;
			}
			socket.emit('record', {record:recording});
		}
	});
});
