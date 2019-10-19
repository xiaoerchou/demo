(function (global) {

  var AudioCox = global.webkitAudioContext || global.mozAudioContext || global.msAudioContext || global.AudioContext;

  var MP3Recorder = function (config) {

    if (!config) config = {};

    this.state = 'init'; //录音机状态
    this.error = '';
    this.config = Object.assign({
      sampleRate: 44100, // 采样率
      bitRate: 128, // 采样数位
      mediaTrackConstraints: true, //媒体是否开放,
      bufferSize: 0,
      channel: 1,
      workerPath: 'assets/yuyin/worker-realtime.js',
      monitorGain: 0,
      recordingGain: 1
    }, config);
  }

  // 检查浏览器是否支持录音
  MP3Recorder.prototype.isRecordingSupported = function () {
    if (AudioCox && global.navigator &&((global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia) || global.navigator.getUserMedia)){
      return true;
    } else {
      return false;
    }
  }

  // 初始化音频控制器
  MP3Recorder.prototype.initAudioContext = function () {
    this.audioContext = new AudioCox();
    this.closeAudioContext = true;
    return this.audioContext;
  }

  // 创建录音器handle
  MP3Recorder.prototype.createScriptNode = function () {
    this.scriptProcessorNode = this.audioContext.createScriptProcessor(this.config.bufferLength, this.config.Channel, this.config.Channel);
    this.config.sampleRate = this.audioContext.sampleRate //重新获取采样率
    this.scriptProcessorNode.connect(this.audioContext.destination);
    //获取输出数据进行编码
    this.scriptProcessorNode.onaudioprocess = (e) => {
      this.encodeBuffers(e.inputBuffer);
    };

    //设置输出音量增益
    this.monitorGainNode = this.audioContext.createGain();
    this.setMonitorGain(this.config.monitorGain);
    this.monitorGainNode.connect(this.audioContext.destination);

    //设置输入音量增益
    this.recordingGainNode = this.audioContext.createGain();
    this.setRecordingGain(this.config.recordingGain);
    this.recordingGainNode.connect(this.scriptProcessorNode);
    // 当前时间设置音量为0
    // this.recordingGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    //0.01秒后音量为1
    // this.recordingGainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.01);
  }

  // 设置输入增益
  MP3Recorder.prototype.setRecordingGain = function (gain) {
    this.config.recordingGain = gain;

    if (this.recordingGainNode && this.audioContext) {
      this.recordingGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
    }
  };

  // 设置输出增益
  MP3Recorder.prototype.setMonitorGain = function (gain) {
    this.config.monitorGain = gain;

    if (this.monitorGainNode && this.audioContext) {
      this.monitorGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
    }
  };

  // 初始化获取录音权限
  MP3Recorder.prototype.initSourceNode = function (flag) {
    var that = this;
    this.error = '';
    if (global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia) {
      console.log('mediaDevices');
      return global.navigator.mediaDevices.getUserMedia({audio: that.config.mediaTrackConstraints})
        .then((stream) => {
          if (!flag) {
            that.stream = stream;
            // 创建媒体流控制器
            return that.audioContext.createMediaStreamSource(stream);
          } else {
            return true;
          }
        }).catch((err) => {
          console.log(err);
          var msg;
          switch (err.code || err.name) {
            case 'PERMISSION_DENIED':
            case 'PermissionDeniedError':
              msg = '用户拒绝访问麦克风';
              break;
            case 'NOT_SUPPORTED_ERROR':
            case 'NotSupportedError':
              msg = '浏览器不支持麦克风';
              break;
            case 'MANDATORY_UNSATISFIED_ERROR':
            case 'MandatoryUnsatisfiedError':
              msg = '找不到麦克风设备';
              break;
            default:
              msg = '未打开浏览器语音权限或麦克风未插好';
              break;
          }
          that.error = msg;
          return false;
        });
    } else {
      console.log('getUserMedia');
      return new Promise((resolve, reject) => {
        global.navigator.getUserMedia({
          audio: that.config.mediaTrackConstraints
        }, function (s) {
          resolve(s);
        }, function (e) {
          reject(e);
        });
      }).then((stream) => {
        if (!flag) {
          that.stream = stream;
          // 创建媒体流控制器
          return that.audioContext.createMediaStreamSource(stream);
        } else {
          return true;
        }
      }).catch((err) => {
        var msg;
        switch (err.code || err.name) {
          case 'PERMISSION_DENIED':
          case 'PermissionDeniedError':
            msg = '用户拒绝访问麦克风';
            break;
          case 'NOT_SUPPORTED_ERROR':
          case 'NotSupportedError':
            msg = '浏览器不支持麦克风';
            break;
          case 'MANDATORY_UNSATISFIED_ERROR':
          case 'MandatoryUnsatisfiedError':
            msg = '找不到麦克风设备';
            break;
          default:
            msg = '未打开浏览器语音权限或麦克风未插好';
            break;
        }
        that.error = msg;
        return false;
      })
    }
  };

  //是否已打开语音权限
  MP3Recorder.prototype.getScope = function() {
    var that = this;
    return new Promise((resolve,reject) => {
      Promise.all([this.initSourceNode(true)]).then((res) => {
        if(res[0]){
          resolve('初始化成功');
        } else {
          resolve(that.error);
        }
        that.reset();
      })
    })
  };

  MP3Recorder.prototype.initWorker = function () {
    var that = this;
    if (!this.worker) {
      this.worker = new Worker(this.config.workerPath);
    }
    // 监听worker发送消息
    var worker = this.worker;
    var callback = (e) => {
      switch (e.data.cmd) {
        case 'init':
          log('初始化成功');
          that.onInit('初始化成功');
          break;
        case 'end':
          log('MP3大小：', e.data.buf.length);
          that.onStop(new Blob(e.data.buf, {type: 'audio/mp3'}));
          worker.removeEventListener('message', callback);
          this.state = 'init';
          that.clearStream();
          break;
        case 'error':
          log('错误信息：' + e.data.error);
          that.reset();
          that.onError(e.data.error);
          break;
        default:
          log('未知信息：', e.data);
      }
    }
    this.worker.addEventListener('message', callback);
  };

  // 对数据编码
  MP3Recorder.prototype.encodeBuffers = function (inputBuffer) {
    if (this.state === "recording") {
      var buffers = [];
      // for (var i = 0; i < inputBuffer.numberOfChannels; i++) {
      //   buffers[i] = inputBuffer.getChannelData(i);
      // }
      buffers = inputBuffer.getChannelData(0);
      // console.log(buffers);
      //向worker发送消息
      this.worker.postMessage({cmd: 'encode', buf: buffers});
    }
  };

  //录音开始
  MP3Recorder.prototype.start = function () {
    console.log('start');
    var that = this;
    if (this.state === "init") {
      this.initAudioContext();
      this.createScriptNode();
      Promise.all([this.initSourceNode(), this.initWorker()]).then((results) => {
        console.log(results);
        if (results[0]) {
          log('录音开始');
          this.sourceNode = results[0];
          this.state = "recording";
          this.onStart();
          this.worker.postMessage({
            cmd: 'init',
            config: {
              sampleRate: that.config.sampleRate,
              bitRate: that.config.bitRate
            }
          });
          this.sourceNode.connect(this.monitorGainNode);
          this.sourceNode.connect(this.recordingGainNode);
        } else {
          that.onError(this.error);
          that.reset();
        }
      });
    }
  };

  //录音停止
  MP3Recorder.prototype.stop = function () {
    console.log('stop');
    if (this.state !== "init") {
      // this.state = "init";
      this.monitorGainNode.disconnect();
      this.scriptProcessorNode.disconnect();
      this.recordingGainNode.disconnect();
      this.sourceNode.disconnect();
      this.worker.postMessage({cmd: 'finish'});
    }
  };

  // 重置录音机
  MP3Recorder.prototype.reset = function () {
    this.state = 'init';
    this.error = '';
    this.clearStream();
    this.onReast();
  }

  // 清楚录音数据,关闭麦克风
  MP3Recorder.prototype.clearStream = function () {
    console.log('进来了');
    if (this.stream) {
      if (this.stream.getTracks) {
        this.stream.getTracks().forEach(function (track) {
          track.stop();
        });
      } else {
        this.stream.stop();
      }
      delete this.stream;
    }
    if (this.audioContext && this.closeAudioContext) {
      console.log('ddd');
      this.audioContext.close();
      delete this.audioContext;
    }
  };


  // 打印日志
  function log(str) {
    console.log(str);
  }


  // 回调钩子
  MP3Recorder.prototype.onInit = function () {
  };
  MP3Recorder.prototype.onError = function () {
  };
  MP3Recorder.prototype.onStart = function () {
  };
  MP3Recorder.prototype.onStop = function () {
  };
  MP3Recorder.prototype.onReast = function () {
  };


  var SingleRecoder = (function () {
    let _instance = null;
    return function (options) {
      if (!_instance) {
        _instance = new MP3Recorder(options);
      }
      return _instance;
    }
  })();

  global.MP3Recorder = SingleRecoder;
})(window);
