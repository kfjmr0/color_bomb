// app.js
var
  app = require('http').createServer(handler),
  io = require('socket.io').listen(app),
  fs = require('fs'),
  
  isFakeMatch = false, // for test
  watingTimer,
  WAITING_TIME_LIMIT = 30000,
  currentWatingPeople = 0,
  currentWatingRoom,
  roomStateList = [],
  // ----- variables common in server and client/start -----
  CELL_NUM = 13,
  BOMB_NUM = 3,
  TIME_TO_EXPLOSION = 3000,
  COLOR_NUMBER = 4,
  GAME_DURATIONsec = 180,
  // ----- variables common in server and client/end -----
  initRoom, joinRoom;


function handler( req, res ) {
  fs.readFile(__dirname + '/index.html', function(err, data) {
    if ( err ) {
      res.writeHead(500);
      return res.end('Error');
    }
    res.writeHead(200);
    res.write(data);
    res.end();
  });
}

initRoom = function ( room ) {
  var i, j, player0_color, player1_color;
  player0_color = Math.floor(Math.random() * COLOR_NUMBER);
  player1_color = (player0_color + Math.floor(Math.random() * (COLOR_NUMBER-1)) + 1) % COLOR_NUMBER;
  roomStateList[room] = {
    socketIdList : [],
    nameList : [],
    bombMatrix : [],
    bombList : [],
    bomb_id : 0,
    possessedBombList : [ BOMB_NUM, BOMB_NUM ],
    player0_color : player0_color,
    player1_color : player1_color,
  };
  for ( i = 0; i < CELL_NUM; i++ ) {
    roomStateList[room].bombMatrix[i] = [];
    for ( j = 0; j < CELL_NUM; j++ ) {
      roomStateList[room].bombMatrix[i][j] = 0;
    }
  }
};

joinRoom = function ( socket, room, name, player_id ) {
  var socket_id = socket.id;
  socket.join(room);
  socket.emit('joinRoom', {
    room : room,
    player_id : player_id,
    CELL_NUM : CELL_NUM,
    BOMB_NUM : BOMB_NUM,
    TIME_TO_EXPLOSION : TIME_TO_EXPLOSION,
    GAME_DURATIONsec : GAME_DURATIONsec,
    player0_color : roomStateList[room].player0_color,
    player1_color : roomStateList[room].player1_color,
  });
  roomStateList[room].socketIdList[ player_id ] = socket_id;
  roomStateList[room].nameList[ player_id ] = name;
  
  console.log( name + ' join room ' + room 
    + ' with socket.id ' + socket.id
  );
  
};

io.sockets.on('connection', function( socket ) {
  
  // ----- start of socket.on 'offerMatch' -----
  socket.on('offerMatch', function( data ) {
    var now, room;
    
    now = new Date();
    
    // ----- test for the process after the matching succeeded/start
    if ( isFakeMatch ) {
      room = 'testroom' + now.getTime();
      initRoom( room );
      
      joinRoom( socket, room, data.name, 0 );
      roomStateList[room].nameList[1] = 'FakePlayer';
      
      io.sockets.to(room).emit('matchReady', {
        nameList : roomStateList[room].nameList,
      });
      setTimeout(function() {
        io.sockets.to(room).emit('startBattle');
        setTimeout(function() {
          io.sockets.to(room).emit('finishBattle');
          socket.leave(room);
          roomStateList[room] = null;
        }, GAME_DURATIONsec * 1000);
      }, 4000);
      
      return false;
    }
    // ----- test for the process after the matching succeeded/end
    
    // ----- actual matching process start -----
    if ( currentWatingPeople === 0 ) {
      room = data.name + now.getTime();
      currentWatingRoom = room;
      initRoom( room );
      joinRoom( socket, room, data.name, currentWatingPeople );
      //joinRoom( socket, room, data.name, 0 );
      currentWatingPeople++;
      
      watingTimer = setTimeout( function () {
        currentWatingPeople = 0;
        socket.emit('offerTimeout');
        socket.leave(room);
      }, WAITING_TIME_LIMIT);
      //console.log('wating : ' + currentWatingPeople + ' people in room ' + room );
      
    } else if ( currentWatingPeople === 1 ) {
      clearTimeout(watingTimer);
      room = currentWatingRoom;
      joinRoom( socket, room, data.name, currentWatingPeople );
      //joinRoom( socket, room, data.name, 1 );
      
      currentWatingPeople = 0;
      currentWatingRoom = null;
      
      io.sockets.to(room).emit('matchReady', {
        nameList : roomStateList[room].nameList,
      });
      setTimeout(function() {
        io.sockets.to(room).emit('startBattle');
        setTimeout(function() {
          io.sockets.to(room).emit('finishBattle');
          socket.leave(room);
          roomStateList[room] = null;
        }, GAME_DURATIONsec * 1000);
      }, 4000);
      
      
    } else {
      // what if currentWatingPeople somehow became the value other than 0 or 1.... think later
      //console.log('Something is wRong in matching process! currentWatingPeople = ' + currentWatingPeople );
      currentWatingPeople = 0;
      if ( currentWatingRoom ) {
        roomStateList[currentWatingRoom] = null;
      }
      //process.exit(1);
      return false;
    }
  });
  // ----- end of socket.on 'offerMatch' -----
  
  socket.on('cancelOffer', function() {
    currentWatingPeople = 0;
    roomStateList[currentWatingRoom] = null;
    clearTimeout(watingTimer);
  });
  
  
  // ----- socket used in game / start -----
  socket.on('askForSetBomb', function(data) {
    var
      player_id,
      room = data.room,
      bomb_id,
      position= data.position;

    if (roomStateList[room] == null) {
      // invalid room
      return false;
    }
    
    if ( socket.id === roomStateList[room].socketIdList[0] ) {
      player_id = 0;
    } else if ( socket.id === roomStateList[room].socketIdList[1] ) {
      player_id = 1;
    } else {
      // invalid socket.id
      return false;
    }
    
    // validation for setbomb
    if ( roomStateList[room].possessedBombList[ player_id ] <= 0 ) {
      return false;
    } else if ( roomStateList[room].bombMatrix[ position[0] ][ position[1] ] > 0) {
      return false;
    }
    
    // create new bomb
    roomStateList[room].possessedBombList[ player_id ]--;
    roomStateList[room].bomb_id++;
    bomb_id = roomStateList[room].bomb_id;
    roomStateList[room].bombList[ bomb_id ] = {
      player_id : player_id,
      position : position,
      haveExplodedIn_P0 : false,
      haveExplodedIn_P1 : false
    };
    roomStateList[room].bombMatrix[ position[0] ][ position[1] ] = bomb_id;
    
    //
    io.sockets.to(room).emit('setBomb', {
      player_id : player_id,
      position : position,
      bomb_id : bomb_id
    });
    
    // start timer to explode bomb
    roomStateList[room].bombList[ bomb_id ].timer = setTimeout( function () {
      io.sockets.to(room).emit('orderBombExplosion', {
        bomb_id : bomb_id,
      });
    }, TIME_TO_EXPLOSION);
    
  });
  
  // ----- socket event bombExploded start -----
  // This event clears space where the bomb already exploded
  socket.on('bombExploded', function (data) {
    var
      player_id,
      room = data.room,
      bomb_id = data.bomb_id,
      bomb_owner,
      position;
    
    if (roomStateList[room] == null) {
      // invalid room
      return false;
    }
    
    if ( socket.id === roomStateList[room].socketIdList[0] ) {
      player_id = 0;
    } else if ( socket.id === roomStateList[room].socketIdList[1] ) {
      player_id = 1;
    } else {
      // invalid socket.id
      return false;
    }
    
    if ( isFakeMatch ) {
      clearTimeout( roomStateList[room].bombList[ bomb_id ].timer );
      position = roomStateList[room].bombList[ bomb_id ].position;
      //console.log( 'bomb ' + bomb_id + ' exploded');
      roomStateList[room].bombMatrix[ position[0] ][ position[1] ] = 0;
      roomStateList[room].bombList[ bomb_id ] = null;
      roomStateList[room].possessedBombList[ player_id ]++;
      return false;
    }
    
    //
    if ( player_id === 0 ) {
      roomStateList[room].bombList[ bomb_id ].haveExplodedIn_P0 = true;
    } else if ( player_id === 1 ) {
      roomStateList[room].bombList[ bomb_id ].haveExplodedIn_P1 = true;
    } else {
      return false;
    }
    
    // clear the bomb after comfirming that the bomb have exploded in both players' display
    if ( roomStateList[room].bombList[ bomb_id ].haveExplodedIn_P0 
      && roomStateList[room].bombList[ bomb_id ].haveExplodedIn_P1 )
    {
      clearTimeout( roomStateList[room].bombList[ bomb_id ].timer );
      
      // reload bombs
      bomb_owner = roomStateList[room].bombList[ bomb_id ].player_id;
      roomStateList[room].possessedBombList[ bomb_owner ]++;
      // clear the position where the bomb existed and remove object
      position = roomStateList[room].bombList[ bomb_id ].position;
      roomStateList[room].bombMatrix[ position[0] ][ position[1] ] = 0;
      roomStateList[room].bombList[ bomb_id ] = null;
      
      
    } else {
      return false;
    }
    
  });
  // ----- socket event bombExploded end -----
  
  // ----- process to terminate the game start -----
  // ----- process to terminate the game end -----
  
  // ----- socket used in game / end -----
});


io.set('log level', 0);
//io.set('log level', 1);

app.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = app.address();
  console.log("Server listening at", addr.address + ":" + addr.port);
});