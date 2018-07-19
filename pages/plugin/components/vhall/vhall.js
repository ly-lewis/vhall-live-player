import VhallMain from '../../sdk/vhallMain.js';
import Socket from '../../sdk/socket.js';
import { EVENTE, Error, timeOut, videoDefault, pushLogUrl} from '../../api/config.js';
import videoJs from '../../sdk/video.js';
import DocHelp from './docHelp';
let count = 0;
Component({
    options: {
        multipleSlots: true
    },
    data: {
        videoUrl:'',
        liveUrl: '',
        playerHeight:'100%',
        playStatus:0,
        playing:false,
        liveId:'VHALL_LIVE_ID_'+new Date().getTime(),
        videoId: 'VHALL_VIDEO_ID_' + new Date().getTime(),
        defaultImgShow:false,
        showLoading:false,
        vhallStatic: {
          playDefaultImg: videoDefault
        },
        options: {},
        animationRotate:{},
        currentQuality: '',
        currentLineIndex: '',
        fullScreen: false,
        backShow:false
    },
    attached: function(){
      VhallMain.on('finishDoc', (docMsg) => {
        this.setInitDocOption = docMsg.success;
      });
      let _this = this;
      wx.getSystemInfo({
        success: function (res) {
          wx.setStorage({
            key: "systemInfo",
            data: res
          });
          let h = (res.windowWidth / 16) * 9;
          _this.setData({
            playerHeight: h
          });
        }
      });
      VhallMain.on('initVhall', (options) => {
        this.setData({
          options: options
        });
        this.initVhall();
      });
      VhallMain.on('error', (msg) => {
          this.triggerEvent("errorMsg", msg);
      });
    },
    detached: function () { //组件生命周期函数，在组件实例被从页面节点树移除时执行
      VhallMain.removeAll();
      if (this.data.playStatus != 1) return;
      this.socket.disconnect();
    },
    ready: function () {
        VhallMain.on('control', (type, val) => {
            switch (type) {
                case EVENTE.EVENT_PLAY:
                    this.bindPlay(); //播放
                    break;
                case EVENTE.EVENT_PAUSE:
                    this.bindPause(); //暂停
                    break;
                case EVENTE.EVENT_SEEK:
                    this.bindSeekTo(val); //seek
                    break;
                case EVENTE.EVENT_FULLSCREEN:
                    this.bindFullScreen(val); //全屏
                    break;
                case EVENTE.EVENT_EXIT_FULLSCREEN:
                    this.bindExitFullScreen(); //退出全屏
                    break;    
                case EVENTE.EVENT_AWAKE:
                    this.awakeVhall(); //唤醒
                    break;
                case EVENTE.EVENT_CHANGESOURCE:
                    this.changeSource(val); // 切线，换源
                    break;
            }
        });
    },
    methods: {
        initVhall: function(){
          wx.showLoading({
            title: '加载中',
          });
          let options = this.data.options;
          VhallMain.init(options).then((res) => { 
            if (res.data.code != 200) {
              if (res.data.code==1001){
                this.triggerEvent("errorMsg", {
                  code: '20004',
                  msg: Error['20004']
                });
              }else{
                this.triggerEvent("errorMsg", {
                  code: '20004',
                  msg: Error['20004']
                });
              }
              return;
            }
            this.setData({
                playStatus: res.data.data.webinarStatus
            });
            if (this.data.playStatus == 1) { //直播
              this.setData({
                videoUrl: ''
              });
              this.triggerEvent("playStatus", {
                status: this.data.playStatus,
                msg: '直播'
              });
              //初始化socket服务
              if(!this.socket){ 
                this.socket = Socket.init(res.data.data);
              } else if (this.socket && !this.socket.connect){
                this.socket.open();
              }
              this.vHallcontext = wx.createLivePlayerContext(this.data.liveId, this);
            } else if (this.data.playStatus == 2){ //预览
              this.setData({
                liveUrl: ''
              });
              this.triggerEvent("playStatus", {
                status: this.data.playStatus,
                msg: '预览'
              });
              return;
            }else if (this.data.playStatus == 3){ // 回放
              this.setData({
                liveUrl: ''
              });
              this.triggerEvent("playStatus", {
                status: this.data.playStatus,
                msg: '回放或者点播'
              });
              this.vHallcontext = wx.createVideoContext(this.data.videoId, this);
              if (this.setInitDocOption) {
                this.setInitDocOption(res.data.data.doc);
              }
              let docUrl = res.data.data.mobilePlayer.msgUrl;
              if(docUrl){
                VhallMain.getDocs(docUrl).then((docsData) => {
                  this.docArry = DocHelp.formartDocs(docsData.data);
                });
              }else{
                console.error('无法获取到文档绘制信息'); 
              }
            }
            this.initLivePlayer(options,res.data.data);
            VhallMain.on('online', (msg) => {
                this.onOnlineMessage(msg);
            });
            VhallMain.on('cmdMsg', (msg) => {
                this.onCmdMessage(msg);
            });
            if (this.setInitDocOption){
              this.setInitDocOption(res.data.data.doc);
            }
          }).catch(() => {
              this.triggerEvent("errorMsg", {
                  code: '20003',
                  msg: Error['20003']
              });
          });
        },
        initLivePlayer: function(options,data){
            let mobilePlayer = data.mobilePlayer;
            let dispatchDomain = mobilePlayer.against_url;
            let playerType = 'rtmp';
            let baseMode = 'live';
            let uri = '';
            let livePlayerKey = 'liveUrl';
            let _id = this.data.liveId;
            if(this.data.playStatus == 3){//回放
              playerType = 'hls';
              baseMode = 'vod';
              livePlayerKey = 'videoUrl';
              _id = this.data.videoId;
              if (mobilePlayer.lines[0].srv) {
                uri = mobilePlayer.lines[0].srv;
              } else {
                uri = mobilePlayer.lines[0].srv_audio;
              }
              uri = uri.replace(/(.+\.com)/, '');
            }
            this.player = new videoJs({
                id_: _id,
                wx: wx,
                player: this.vHallcontext,
                livePlayerKey: livePlayerKey,
                type_: playerType,//默认flv
                baseMode: baseMode,
                pushUrl: pushLogUrl,//日志上报地址
                uri: uri,
                dispatchDomain: 'https:' + dispatchDomain,
                vodQuality: ['same'],
                arguments: {
                  aid: options.roomid,//roomId
                  uid: data.visitor.id,//第三方用户ID
                  bu: 1
                }
            }, this);
            let st1 = setTimeout(()=> {
              clearTimeout(st1);
              this.bindPlay();
              // 保持屏幕常亮
              wx.setKeepScreenOn({
                  keepScreenOn: true
              });
            }, 500);
            // let st2 = setTimeout(() => {
            //   clearTimeout(st2);
            //   this.setData({
            //     currentQuality: this.player.currentClearStatus,
            //     currentLineIndex: this.player.subSrcIndex
            //   });  
            //   this.triggerEvent("playSource", {
            //     sourceInfo: {
            //       lineTypes: ['线路1', '线路2'],
            //       qualiTypes: this.player.choiceClearStatus
            //     },
            //     currentQuality: this.player.currentClearStatus,
            //     currentLineIndex: this.player.subSrcIndex
            //   });
            // }, 5000);
        },
        onCmdMessage: function(msg){
          let playSource = this.data.playSource;
          if(msg.type=='*over'){
            msg.type = 'over'; //直播结束
            let t = setTimeout(() => {
              clearTimeout(t);
              this.bindPause();
            }, timeOut);
          } else if (msg.type == '*publishStart'){
              msg.type = 'start'; //直播开始
              this.initVhall();
          } else if (msg.type == '*kickout'){
              msg.type = 'kickout'; //直播被踢出
              this.bindPause();
          }else if(msg.type == '*kickoutrestore'){
              msg.type = 'kickoutRestore'; // 恢复踢出
              this.bindPlay();
          }
          else{
            return;
          }
          this.triggerEvent("onMessage", msg);
        },
        onOnlineMessage: function(data){
            console.log('--收到online消息--');
            console.log(data);
        },
        changeSource(msg){ 
          if (msg.currentQuality && msg.currentQuality != this.player.currentClearStatus){//切清晰度
            this.switchQualityLevel(msg.currentQuality);  
          } else if (msg.currentLineIndex != this.player.subSrcIndex){ //切线
            this.player.subSrcIndex = (msg.currentLineIndex ? msg.currentLineIndex : 0);
            this.player.switchSrc(); 
          }
        },
        switchQualityLevel(key){
          this.player.switchQualityLevel(key);
        },
        bindPlay: function () {
          if (this.data.playing) {
            this.vHallcontext.play();
            return;
          }
          this.setData({
            playing:true,
            showLoading:false
          });
          wx.hideLoading();
          this.player.play();
        },
        bindPause: function () {
          this.setData({
            showLoading: true
          });
          if(this.data.playStatus==1){
            this.setData({
              defaultImgShow: false
            });
            this.player.stop();
          }else{
            this.vHallcontext.pause();
          }
        },
        bindSeekTo: function (second){
          if (this.data.playStatus==1){ //直播
            this.triggerEvent("errorMsg", {
                code: '40001',
                msg: Error['40001']
            });
          } else if (this.data.playStatus == 3){ //回放
            this.vHallcontext.seek(second);
          }
        },
        onStatus: function (e){
          this.player.bindstatechange(e.detail.code);
          if (e.detail.code == 2004) {//2004 开始播放
            wx.hideLoading();
            this.setData({
              currentQuality: this.player.currentClearStatus,
              currentLineIndex: this.player.subSrcIndex
            });  
            this.triggerEvent("playSource", {
              sourceInfo: {
                lineTypes: ['线路1', '线路2'],
                qualiTypes: this.player.choiceClearStatus
              },
              currentQuality: this.player.currentClearStatus,
              currentLineIndex: this.player.subSrcIndex
            });
            this.setData({
              defaultImgShow:true,
              showLoading: false
            });
          } else if (e.detail.code == 2006) {//2006 视频播放结束
            this.setData({
              defaultImgShow: true,
              showLoading: false
            });
          }
        },
        bindFullScreen: function (typeVal) {
          this.vHallcontext.requestFullScreen({
            direction: typeVal
          });
        },
        bindExitFullScreen: function () {
          this.vHallcontext.exitFullScreen();
        },
        bingExitFullScreen: function () {
          this.vHallcontext.exitFullScreen();
        },
        playWaiting: function(){ /* 等待缓冲 */
          this.triggerEvent("playWaiting",{
              code:'40002',
              msg: Error['40002']
          });
        },
        fullScreenChange: function(e){
          this.setData({
            backShow:false,
            fullScreen: e.detail.fullScreen
          });
          this.triggerEvent("fullScreenChange", e.detail);
        },
        playTimeUpdate: function(e){
          if (this.docArry && this.docArry.length>0){
            DocHelp.sendDocMsg(this.docArry, e.detail.currentTime);
          }
          this.triggerEvent("playTimeUpdate",e.detail);
        },
        videoErrorCallback: function (e) {
          this.setData({
            playing: false
          });
          this.triggerEvent("errorMsg", {
              type:'40000',
              msg: Error['40000']
          });
        },
        /*  监听播放状态进行上报处理 */
        vodplay: function () {
          this.setData({
            defaultImgShow: true
          });
          this.player.onBindPlay();
          let st2 = setTimeout(() => {
            clearTimeout(st2);
            try{
              this.setData({
                currentQuality: this.player.currentClearStatus,
                currentLineIndex: this.player.subSrcIndex
              });
              this.triggerEvent("playSource", {
                sourceInfo: {
                  lineTypes: ['线路1', '线路2'],
                  qualiTypes: this.player.choiceClearStatus
                },
                currentQuality: this.player.currentClearStatus,
                currentLineIndex: this.player.subSrcIndex
              });
            }catch(e){
              console.error('获取线路信息失败');
            }
          }, 1000);
        },
        vodpause: function () {
          this.player.onBindPause();
        },
        vodEnd: function () {
          this.setData({
            defaultImgShow: false
          });
          this.player.onBindEnd();
        },
        vodError: function (e) {
          wx.hideLoading();
          this.setData({
            defaultImgShow: false
          });
          this.player.onError();
        }
    }
})