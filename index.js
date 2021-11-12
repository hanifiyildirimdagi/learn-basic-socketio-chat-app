var express = require('express')
var app = express();
app.use(express.json());
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var firebase = require("firebase/app");
var admin = require('firebase-admin');
require('firebase/auth');
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
};
const {
    v4: uuidv4
} = require('uuid');
let db;

//#region Middleware 
const checkAuth = require('./middleware/auth');
//#region 

let numUsers = 0;
let onlineUsers = [];
let rooms = [];
let chats = [];

//#region JWT
var jwt = require('jsonwebtoken');

function signIn(email) {
    const token = jwt.sign({
        data: email,
        algorithm: 'RS256'
    }, 'aksjdaksfha3980192381rf1g9', {
        expiresIn: 60 * 60
    });
    return token;
}
//#endregion

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/sign-up', (req, res) => {
    firebase.auth().createUserWithEmailAndPassword(req.body.email, req.body.password)
        .then((user) => {
            var user = firebase.auth().currentUser;
            user.updateProfile({
                displayName: req.body.fullName,
                photoURL: "http://via.placeholder.com/128"
            }).then(function () {
                const token = signIn(req.body.email);
                res.send(token).status(200);
            }).catch(function (error) {
                res.send(error.message);
            });
        })
        .catch((error) => {
            res.send(error.message);
        });
});

app.post('/sign-in', (req, res) => {
    const payload = req.body;
    firebase.auth().signInWithEmailAndPassword(payload.email, payload.password)
        .then((user) => {
            const token = signIn(payload.email);
            res.status(200).send(token);
        })
        .catch((error) => {
            res.status(401).send("Email or Password Wrong");
        });
});

app.get('/me', (req, res) => {
    let mail = "";
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, 'aksjdaksfha3980192381rf1g9', {
            algorithms: ['HS256']
        });
        mail = decoded.data;
    } catch (e) {
        res.status(401).send("Auth Failed");
        return;
    }
    admin.auth().getUserByEmail(mail).then((user) => {
        const onlyUserInfo = {
            email: user.email,
            uid: user.uid,
            displayName: user.displayName,
            photoURL: user.photoURL
        }
        if (onlyUserInfo) {
            res.status(200).send(onlyUserInfo);
        } else {
            res.status(401);
            res.send("Failed");
        }
    });

}).use(checkAuth);

app.post('/chat/rooms', async (req, res) => {
    let payload = req.body;
    let roomEntity = {
        roomId: uuidv4(),
        roomName: payload.roomName,
        isDeleted: false
    };
    try {
        await db.collection('Rooms').add(roomEntity);
        rooms.push(roomEntity);
        payload.users.forEach(async (uid) => {
            await db.collection('RoomUsers').add({
                id: uuidv4(),
                roomId: roomEntity.roomId,
                uid: uid,
                addedAt: new Date()
            });
        });
        getRooms();
        res.status(200).send(roomEntity.roomId);
    } catch (err) {
        res.status(400).send(err);
    }
}).use(checkAuth);;

app.get('/chat/rooms', async (req, res) => {
    const roomId = req.query.id;
    if (roomId == null || roomId == undefined || roomId == "")
        return res.status(204).send(null);
    res.status(200).send(rooms.filter(x => x.roomId == roomId)[0]);
}).use(checkAuth);

function getRooms() {
    db.collection('Rooms').get().then(snap => {
        rooms = snap.docs.map(doc => doc.data());
    });
}


















io.on('connection', function (socket) {
    let addedUser = false;

    //#region USER CASTING
    socket.on('add user', (username) => {
        socket.emit('get rooms', username);
        if (addedUser) return;
        // we store the username in the socket session for this client
        socket.username = username;
        numUsers++;
        onlineUsers.push(username);
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers,
            users: onlineUsers
        });
        // echo globally (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers,
            users: onlineUsers
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', {
            username: socket.username
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {
            --numUsers;
            onlineUsers = onlineUsers.filter(x => x != socket.username);
            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });
    //#endregion


    socket.on('rooms', (data) => {
        getRooms();
        socket.emit('rooms', {
            rooms
        });
    });

    socket.on('new message', (data) => {
        // we tell the client to execute 'new message'
        const payload = {
            roomId: data.roomId,
            user: socket.username,
            message: data.message,
            id: uuidv4(),
            at: new Date()
        };
        chats.push(payload);
        socket.emit('new message', chats);
        socket.broadcast.emit('new message', chats);
    });
});



http.listen(5500, () => {
    var serviceAccount = require("./app-firebase.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    firebase.initializeApp(firebaseConfig);
    getRooms();
    console.log('listening on *:5500');
});