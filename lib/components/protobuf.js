const fs = require('fs');
const path = require('path');
const protobuf = require("protobufjs");
const logger = require('pomelo-logger').getLogger('pomelo', __filename);
const crypto = require('crypto');

module.exports = function (app, opts) {
    return new Component(app, opts);
};

const Component = function (app, opts) {
    this.app = app;
    this.protoGroups = {};
    this.protoBuilders = {};
};

const pro = Component.prototype;

pro.name = '__decodeIO__protobuf__';

pro.start = function (cb) {
    const server_pro_path = path.join(this.app.getBase(), '/config/server-protos.json');
    const client_pro_path = path.join(this.app.getBase(), '/config/client-protos.json');
    const server_gm_pro_path = path.join(this.app.getBase(), '/config/server-gm-protos.json');
    const client_gm_pro_path = path.join(this.app.getBase(), '/config/client-gm-protos.json');

    this.protoGroups = {
        "S": {"ver": "", "type": "server", "proto": ""},
        "C": {"ver": "", "type": "client", "proto": ""},
        "S-GM": {"ver": "", "type": "server", "proto": ""},
        "C-GM": {"ver": "", "type": "client", "proto": ""}
    };

    this.protoGroups['S'].proto = require(server_pro_path);
    this.protoGroups['C'].proto = require(client_pro_path);
    this.protoGroups['S-GM'].proto = require(server_gm_pro_path);
    this.protoGroups['C-GM'].proto = require(client_gm_pro_path);

    this.protoGroups['S'].ver = crypto.createHash('md5').update(JSON.stringify(this.protoGroups['S'].proto)).digest('base64');
    this.protoGroups['C'].ver = crypto.createHash('md5').update(JSON.stringify(this.protoGroups['C'].proto)).digest('base64');
    this.protoGroups['S-GM'].ver = crypto.createHash('md5').update(JSON.stringify(this.protoGroups['S-GM'].proto)).digest('base64');
    this.protoGroups['C-GM'].ver = crypto.createHash('md5').update(JSON.stringify(this.protoGroups['C-GM'].proto)).digest('base64');

    this.protoBuilders = {
        "server": [],
        "client": [],
    };

    this.protoBuilders["server"].push(protobuf.Root.fromJSON(this.protoGroups['S'].proto));
    this.protoBuilders["server"].push(protobuf.Root.fromJSON(this.protoGroups['S-GM'].proto));
    this.protoBuilders["client"].push(protobuf.Root.fromJSON(this.protoGroups['C'].proto));
    this.protoBuilders["client"].push(protobuf.Root.fromJSON(this.protoGroups['C-GM'].proto));
    process.nextTick(cb);
};

pro.getMsgType = function (type, route) {
    const msgName = route.replace(/\./g, '_');
    for (var i = 0; i < this.protoBuilders[type].length; i++) {
        const MessageType = this.protoBuilders[type][i].lookup(msgName);
        if (MessageType) {
            return MessageType;
        }
    }
    return null;
};

pro.check = function (type, route) {
    const MessageType = this.getMsgType(type, route);
    if (MessageType) {
        return type;
    }

    if (this.app.get('env') === 'development') {
        logger.warn("==============消息[%s](%s)没有定义protobuf==============", route, type);
    }
    return false;
};

pro.encode = function (route, message) {
    const MessageType = this.getMsgType("server", route);
    if (!MessageType) {
        return null;
    }
    const protoMsg = MessageType.encode(message).finish();
    return protoMsg;
};

pro.decode = function (route, message) {
    const MessageType = this.getMsgType("client", route);
    if (!MessageType) {
        return null;
    }

    try {
        const msg = MessageType.toObject(MessageType.decode(message), {longs: Number, arrays: true});
        return msg;
    } catch(err) {
        logger.debug('[decode] protobuf 无效消息route:%s, message len:%s =========', route, message.length);
        return null;
    }
};

pro.getProtos = function () {
    return this.protoGroups;
};

pro.stop = function (force, cb) {
    process.nextTick(cb);
};
