function ChatMessage(source, from, userData, message, action) {
    this.source = source;
    this.from = from;
    this.userData = userData;
    this.message = message;
    this.action = action || false;
    this.emoticons = undefined;
    this._isStreamer = undefined;
    this._isForStreamer = undefined;
    this._cutted = false;
}

ChatMessage.prototype.escape = function () {
    this.message = this.message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

ChatMessage.prototype.removeBBCode = function () {
    this.message = this.message.replace(/\[\/?b\]/g, '').replace(/\[\/?url\]/g, '');
};

ChatMessage.prototype.getEmoticons = function () {
    if (this.emoticons)
        return this.emoticons;
    return (this.emoticons = this.source.static.emoticonize(this.message, this.userData));
};

ChatMessage.prototype.isStreamer = function () {
    if (this._isStreamer !== undefined)
        return this._isStreamer;
    return (this._isStreamer = (this.source.channel.match(new RegExp('^' + this.from.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + '$', 'gi')) ? true : false));
};

ChatMessage.prototype.isForStreamer = function () {
    if (this._isForStreamer !== undefined)
        return this._isForStreamer;
    return (this._isForStreamer = (this.message.match(new RegExp(this.source.channel.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), 'gi')) ? true : false));
};

ChatMessage.prototype.cutLinks = function () {
    if (this._cutted)
        return;
    this.message = this.message.replace(/(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?/gi, '[ссылка]');
    this._cutted = true;
};

function TwitchChat(channel_id) {
    this.static = TwitchChat;
    this.channel = channel_id;
    this.channel_id = TwitchChat.getChannelId(channel_id) || null;
    this.socket = null;
    this.badges = {};
    this.badges_status = '';

    this.loadBadges();
    TwitchChat.loadEmoticons();
    this.start();
}

TwitchChat.sname = 'twitch';

TwitchChat.socket_id = 0;

TwitchChat.emoticons_status = '';
TwitchChat.emoticons = [];
TwitchChat.emoticons_default = [];
TwitchChat.emoticons_sets = [];

TwitchChat.getChannelId = function (channel) {
    var matches;
    if (matches = channel.trim().match(/^(?:https?:\/\/)?(?:\w{0,3})?\.twitch\.tv\/(.+?)\/?$/)) {
        return matches[1];
    }
    return channel;
};

TwitchChat.prototype.start = function () {
    var socket = io('https://tmi-relay.nightdev.com:443/', {
        resource: ++TwitchChat.socket_id + '/socket.io',
        'force new connection': true
    });
    socket.on('ohai', function () {
        Chat.insertLog(TwitchChat.sname, this.channel_id, "Подключено.");
        socket.emit('join', this.channel_id);
    }.bind(this));
    socket.on('much connect', function () {
        Chat.insertLog(TwitchChat.sname, this.channel_id, "Ожидание подключения к каналу...");
        socket.once('joined', function () {
            Chat.insertLog(TwitchChat.sname, this.channel_id, "Подключение к каналу установлено");
        }.bind(this));
    }.bind(this));
    socket.on('message', function (data) {
        if (data.message.charAt(0) === '!') return;
        if (/bot$/.test(data.nick)) return;
        Chat.insert(new ChatMessage(this, data.nick, data.userData, data.message, data.action));
    }.bind(this));
    socket.on('clearchat', function (user) {
        //Chat.clearChat(user);
    });
    socket.on('disconnect', function (user) {
        Chat.insertLog(TwitchChat.sname, this.channel_id, "Вы были отключены от сервера.");
    }.bind(this));

    this.socket = socket;
};

TwitchChat.prototype.loadBadges = function () {
    if (this.badges_status == 'getting' || this.badges_status == 'ok') {
        return;
    }
    Chat.insertLog(TwitchChat.sname, this.channel_id, 'Ожидание значков...');
    this.badges_status = 'getting';
    $.getJSON('https://api.twitch.tv/kraken/chat/' + this.channel_id + '/badges?callback=?').done(function (data) {
        if (!data.subscriber) return;
        this.badges['subscriber'] = data.subscriber;
        this.badges_status = 'ok';
        Chat.insertLog(TwitchChat.sname, this.channel_id, 'Значки получены.');
        Chat.badgesLoaded(this, this.badges);
    }.bind(this));
};

TwitchChat.loadEmoticons = function () {
    if (TwitchChat.emoticon_status == 'getting' || TwitchChat.emoticon_status == 'ok') {
        return;
    }
    Chat.insertLog(TwitchChat.sname, null, 'Ожидание смайлов...');
    TwitchChat.emoticons_status = 'getting';
    $.getJSON('https://www.nightdev.com/hosted/emotes.php?callback=?').done(function (data) {
        var i = 0;
        data.emoticons.forEach(function (emoticon) {
            emoticon.regex.match(/^\w+$/) ? emoticon.regex = new RegExp("\\b" + emoticon.regex + "\\b", "g") : emoticon.regex = new RegExp(emoticon.regex, "g");
            emoticon.images.forEach(function (image) {
                var sImage = {
                    url: image.url,
                    width: image.width,
                    height: image.height
                };
                i += 1;
                var smile = {
                    n: i,
                    image: sImage,
                    regex: emoticon.regex
                };
                image.emoticon_set ? (TwitchChat.emoticons_sets[image.emoticon_set] === undefined && (TwitchChat.emoticons_sets[image.emoticon_set] = []),
                    TwitchChat.emoticons_sets[image.emoticon_set].push(smile)) : TwitchChat.emoticons_default.push(smile);
                TwitchChat.emoticons.push(smile);
            });
        });
        TwitchChat.emoticon_status = 'ok';
        Chat.insertLog(TwitchChat.sname, null, "Смайлы получены.");
        Chat.emoticonsLoaded(TwitchChat, TwitchChat.emoticons);
    });
};

TwitchChat.emoticonize = function (message, userData) {
    if (!userData.emotes) return message;
    var emoticons = [];
    userData.emotes.forEach(function (set) {
        if (TwitchChat.emoticons_sets[set] === undefined) return;
        TwitchChat.emoticons_sets[set].forEach(function (emoticon) {
            if (message.match(emoticon.regex)) {
                emoticons.push(emoticon);
                //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(TwitchChat.sname, emoticon));
            }
        });
    });
    TwitchChat.emoticons_default.forEach(function (emoticon) {
        if (message.match(emoticon.regex)) {
            emoticons.push(emoticon);
            //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(TwitchChat.sname, emoticon));
        }
    });
    return emoticons;
};

function GGChat(channel_id) {
    this.static = GGChat;
    this.channel = channel_id;
    this.channel_id = GGChat.getChannelId(channel_id) || null;
    this.socket = null;

    GGChat.loadEmoticons();
    this.start();
}

GGChat.sname = 'gg';

GGChat.emoticons_status = '';
GGChat.emoticons = [];
GGChat.emoticons_default = [];
GGChat.emoticons_premium = [];
GGChat.emoticons_sets = {};
GGChat.emoticons_premium_sets = {};

GGChat.getChannelId = function (channel) {
    var matches, id = channel;
    if (matches = channel.trim().match(/^(?:http:\/\/)?goodgame\.ru\/channel\/(.+?)\/?$/)) {
        id = matches[1];
    }
    $.ajax({
        url: 'http://goodgame.ru/api/getchannelstatus?id=' + id + '&fmt=json',
        async: false,
        dataType: 'json'
    }).done(function (data) {
        if (data instanceof Object) {
            id = Object.keys(data)[0];
        };
    });
    return id;
};

GGChat.prototype.start = function () {
    var socket = new SockJS("http://chat.goodgame.ru:8081/chat");
    socket.onopen = function (e) {
        Chat.insertLog(GGChat.sname, this.channel_id, "Подключено.");
        Chat.insertLog(GGChat.sname, this.channel_id, "Ожидание подключения к каналу...");
        socket.send(JSON.stringify({
            type: "join",
            data: {
                channel_id: this.channel_id,
                hidden: false,
                mobile: 0
            }
        }));
    }.bind(this);
    socket.onmessage = function (e) {
        var data = JSON.parse(e.data);
        if (data.type == 'message') {
            Chat.insert(new ChatMessage(this, data.data.user_name, data.data, data.data.text, false));
        } else if (data.type == 'success_join') {
            Chat.insertLog(GGChat.sname, this.channel_id, "Подключение к каналу установлено...");
        }
    }.bind(this);
    socket.onclose = function () {
        Chat.insertLog(GGChat.sname, this.channel_id, "Вы были отключены от сервера");
    }.bind(this);
    this.socket = socket;
};

GGChat.loadEmoticons = function () {
    if (GGChat.emoticons_status == 'getting' || GGChat.emoticons_status == 'ok') {
        return;
    }
    Chat.insertLog(GGChat.sname, null, 'Ожидание смайлов..');
    GGChat.emoticons_status = 'getting';
    $.get("http://goodgame.ru/js/minified/chat.js", null, null, 'text').done(function (data) {
        var rawGlobal = data.match(/var Global=(\{.*?\});/);
        var global = eval('(' + rawGlobal[1] + ')');
        $.get("http://goodgame.ru/css/compiled/chat.css", null, null, 'text').done(function (cssData) {
            var i = 0;
            var matches;
            global.Smiles.forEach(function (emoticon) {
                i += 1;
                if (matches = cssData.match(new RegExp("\.big \.smiles.smile-" + emoticon.name + "\{(.+?)\}"))) {
                    var smile = {
                        n: i,
                        image: GGChat.parseEmoticonStyle(matches[1])
                    };
                    smile.regex = new RegExp(":" + emoticon.name + ":", "g");
                    smile.image.url = 'http://goodgame.ru/images/smiles/' + emoticon.name + '-big.png'
                    if (emoticon.premium == 1) {
                        GGChat.emoticons_premium.push(smile);
                    } else {
                        GGChat.emoticons_default.push(smile);
                    }
                    GGChat.emoticons.push(smile);
                }
            });
            $.each(global.Channel_Smiles, function (channel_id, emoticons) {
                emoticons.forEach(function (emoticon) {
                    i += 1;
                    if (matches = cssData.match(new RegExp("\.big \.smiles.smile-" + emoticon.name + "\{(.+?)\}"))) {
                        var smile = {
                            n: i,
                            image: GGChat.parseEmoticonStyle(matches[1])
                        };
                        smile.regex = new RegExp(":" + emoticon.name + ":", "g");
                        smile.image.url = 'http://goodgame.ru/images/smiles/' + emoticon.name + '-big.png'
                        if (emoticon.premium == 1) {
                            if (GGChat.emoticons_premium_sets[channel_id] == undefined) {
                                GGChat.emoticons_premium_sets[channel_id] = [];
                            }
                            GGChat.emoticons_premium_sets[channel_id].push(smile);
                        } else {
                            if (GGChat.emoticons_sets[channel_id] == undefined) {
                                GGChat.emoticons_sets[channel_id] = [];
                            }
                            GGChat.emoticons_sets[channel_id].push(smile);
                        }
                        GGChat.emoticons.push(smile);
                    }
                });
            });
            GGChat.emoticons_status = 'ok';
            Chat.insertLog(GGChat.sname, null, "Смайлы получены.");
            Chat.emoticonsLoaded(GGChat, GGChat.emoticons);
        });
    });
};

GGChat.parseEmoticonStyle = function (style) {
    var matches, width, height;
    if (matches = style.match(/width:(\d+?)px/)) {
        width = matches[1];
    }
    if (matches = style.match(/height:(\d+?)px/)) {
        height = matches[1];
    }
    return {
        width: width,
        height: height
    };
};

GGChat.emoticonize = function (message, userData) {
    if (userData.premium == undefined) return message;
    var emoticons = [];
    GGChat.emoticons_default.forEach(function (emoticon) {
        if (message.match(emoticon.regex)) {
            emoticons.push(emoticon);
            //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(GGChat.sname, emoticon));
        }
    });
    if (GGChat.emoticons_sets[this.channel_id] != undefined) {
        GGChat.emoticons_sets[this.channel_id].forEach(function (emoticon) {
            if (message.match(emoticon.regex)) {
                emoticons.push(emoticon);
                //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(GGChat.sname, emoticon));
            }
        });
    }
    if (userData.premium == 1) {
        GGChat.emoticons_premium.forEach(function (emoticon) {
            if (message.match(emoticon.regex)) {
                emoticons.push(emoticon);
                //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(GGChat.sname, emoticon));
            }
        });
        if (GGChat.emoticons_premium_sets[this.channel_id] != undefined) {
            GGChat.emoticons_premium_sets[this.channel_id].forEach(function (emoticon) {
                if (message.match(emoticon.regex)) {
                    emoticons.push(emoticon);
                    //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(GGChat.sname, emoticon));
                }
            });
        }
    }
    return emoticons;
};

GGChat.getGroup = function (group) {
    var colorClass = "";
    switch (group) {
    case 0:
        colorClass = "casual";
        break;
    case 10:
    case 20:
        colorClass = "streamer";
        break;
    case 30:
    case 40:
    case 50:
        colorClass = "moder";
        break;
    default:
        colorClass = "casual";
        break
    }
    return colorClass;
};

GGChat.getPaymentsLevel = function (amount) {
    var level = 0;
    if (amount >= 100 && amount < 300) {
        level = 1
    }
    if (amount >= 300 && amount < 500) {
        level = 2
    }
    if (amount >= 500) {
        level = 3
    }
    if (amount >= 3e3) {
        level = 4
    }
    if (amount >= 1e4) {
        level = 5
    }
    return level;
}

function Sc2tvChat(channel_id) {
    this.static = Sc2tvChat;
    this.channel = channel_id;
    this.channel_id = Sc2tvChat.getChannelId(channel_id) || null;
    this.last_msg_id = null;

    Sc2tvChat.loadEmoticons();
    this.start();
}

Sc2tvChat.sname = 'sc2tv';

Sc2tvChat.emoticons_status = '';
Sc2tvChat.emoticons = [];
Sc2tvChat.emoticons_sets = {};

Sc2tvChat.getChannelId = function (channel) {
    var matches, id = channel;
    if ((matches = channel.trim().match(/^(?:https?:\/\/)?sc2tv\.ru\/channel\/(.+?)\/?$/)) || (matches = channel.trim().match(/^(.+?)$/))) {
        $.ajax({
            url: 'http://sc2tv.ru/channel/' + matches[1],
            async: false,
            dataType: 'text'
        }).done(function (data) {
            matches = null;
            if (matches = data.match(/chat\.sc2tv\.ru\/index\.htm\?channelId=(\d+)/)) {
                id = matches[1];
            }
        });
    }
    return id;
};

Sc2tvChat.prototype.start = Sc2tvChat.prototype.load = function () {
    $.getJSON("http://chat.sc2tv.ru/memfs/channel-" + this.channel_id + ".json").done(function (data) {
        if (!this.last_msg_id) {
            this.last_msg_id = data.messages[0].id;
            return;
        }
        data.messages.reverse().forEach(function (message) {
            if (message.id > this.last_msg_id) {
                this.last_msg_id = message.id;
                Chat.insert(new ChatMessage(this, message.name, message, message.message, false));
            };
        }.bind(this));
    }.bind(this)).always(function () {
        setTimeout(function () {
            this.load()
        }.bind(this), 3000);
    }.bind(this));
};

Sc2tvChat.loadEmoticons = function () {
    if (Sc2tvChat.emoticons_status == 'getting' || Sc2tvChat.emoticons_status == 'ok') {
        return;
    }
    Chat.insertLog(Sc2tvChat.sname, null, "Ожидание смайлов...");
    Sc2tvChat.emoticons_status = 'getting';
    $.get("http://chat.sc2tv.ru/js/smiles.js", null, null, 'text').done(function (data) {
        var rawSmiles = data.match(/var smiles = (\[\{.*?\}\]);/);
        var smiles = eval('(' + rawSmiles[1] + ')');
        var i = 0;
        smiles.forEach(function (emoticon) {
            i += 1;
            var smile = {
                n: i,
                image: {
                    width: emoticon.width,
                    height: emoticon.height,
                    url: 'http://chat.sc2tv.ru/img/' + emoticon.img
                }
            };
            smile.regex = new RegExp(":s" + emoticon.code, "g");
            emoticon.roles.forEach(function (role) {
                var set = role.toString();
                if (Sc2tvChat.emoticons_sets[set] == undefined) {
                    Sc2tvChat.emoticons_sets[set] = [];
                }
                Sc2tvChat.emoticons_sets[set].push(smile);
            });
            Sc2tvChat.emoticons.push(smile);
        });
        Sc2tvChat.emoticons_status = 'ok';
        Chat.insertLog(Sc2tvChat.sname, null, "Смайлы получены.");
        Chat.emoticonsLoaded(Sc2tvChat, Sc2tvChat.emoticons);
    });
};

Sc2tvChat.emoticonize = function (message, userData) {
    if (!userData.roleIds) return message;
    var emoticons = [];
    userData.roleIds.forEach(function (set) {
        set = set.toString();
        if (Sc2tvChat.emoticons_sets[set] == undefined) {
            return message;
        }
        Sc2tvChat.emoticons_sets[set].forEach(function (emoticon) {
            if (message.match(emoticon.regex)) {
                emoticons.push(emoticon);
                //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(Sc2tvChat.sname, emoticon));
            }
        });
    });
    return emoticons;
};

Sc2tvChat.getBadges = function (roleIds) {
    var badges = [];
    if (roleIds.indexOf(35) !== -1)
        badges.push('top-antisupporter');
    if (roleIds.indexOf(24) !== -1)
        badges.push('top-supporter');
    return badges;
};

function CGChat(channel_id) {
    this.static = CGChat;
    this.channel = channel_id;
    this.channel_id = CGChat.getChannelId(channel_id) || null;
    this.socket = null;

    CGChat.loadEmoticons();
    this.start();
}

CGChat.sname = 'cg';

CGChat.emoticons_status = '';
CGChat.emoticons = [];

CGChat.getChannelId = function (channel) {
    var matches;
    if (matches = channel.trim().match(/^(?:http:\/\/)?(?:www\.)?cybergame\.tv\/(.+?)\/?$/)) {
        return matches[1];
    }
    return channel;
};

CGChat.prototype.start = function () {
    var socket = new SockJS('http://cybergame.tv:9090');
    socket.onopen = function (e) {
        Chat.insertLog(CGChat.sname, this.channel_id, "Подключено.");
        Chat.insertLog(CGChat.sname, this.channel_id, "Ожидание подключения к каналу...");
        socket.send("{\"command\":\"login\",\"message\":\"{\\\"login\\\":\\\"\\\",\\\"password\\\":\\\"\\\",\\\"channel\\\":\\\"#" + this.channel_id + "\\\"}\"}");
    }.bind(this);
    socket.onmessage = function (e) {
        var data = JSON.parse(e.data);
        if (data.command == 'chatMessage') {
            var message = JSON.parse(data.message);
            Chat.insert(new ChatMessage(this, message.from, message, message.text, false));
        } else if (data.command == 'changeWindow') {
            Chat.insertLog(CGChat.sname, this.channel_id, "Подключение к каналу установлено...");
        }
    }.bind(this);
    socket.onclose = function () {
        Chat.insertLog(CGChat.sname, this.channel_id, "Вы были отключены от сервера");
    }.bind(this);
    this.socket = socket;
};

CGChat.loadEmoticons = function () {
    if (CGChat.emoticons_status == 'getting' || CGChat.emoticons_status == 'ok') {
        return;
    }
    Chat.insertLog(CGChat.sname, null, "Ожидание смайлов...");
    CGChat.emoticons_status = 'getting';
    $.get("http://cybergame.tv/cgchat.htm", null, null, 'text').done(function (data) {
        var rawSmiles = data.match(/smiles = (\{[\s\S]*?\});/);
        var smiles = eval('(' + rawSmiles[1] + ')');
        var i = 0;
        $.each(smiles, function (name, url) {
            i += 1;
            var smile = {
                n: i,
                image: {
                    width: 20,
                    height: 20,
                    url: 'http://cybergame.tv/' + url
                }
            };
            smile.regex = new RegExp(name.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), 'g');
            CGChat.emoticons.push(smile);
        });
        CGChat.emoticons_status = 'ok';
        Chat.insertLog(CGChat.sname, null, "Смайлы получены.");
        Chat.emoticonsLoaded(CGChat, CGChat.emoticons);
    });
};

CGChat.emoticonize = function (message, userData) {
    if (!userData.when) return message;
    var emoticons = [];
    CGChat.emoticons.forEach(function (emoticon) {
        if (message.match(emoticon.regex)) {
            emoticons.push(emoticon);
            //message = message.replace(emoticon.regex, Chat.getEmoticonHtml(CGChat.sname, emoticon));
        }
    });
    return emoticons;
}