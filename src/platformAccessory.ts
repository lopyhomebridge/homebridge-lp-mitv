import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { AlivedAdapter, ApiAdapter, CheckSourceAdapter, EventKeyAdapter, MIApiClient } from './mitv';

import { MITVHomebridgePlatform } from './platform';
import { PLUGIN_NAME } from './settings';

class KeyMap {
    private obj : {[key:string]:string} = {};
    // constructor(){

    // }

    private key(k :CharacteristicValue):string{
        return `_key_${k}`;
    }

    set(k :CharacteristicValue, v:string){
        this.obj[this.key(k)] = v;
        return this;
    }

    get(k :CharacteristicValue):string{
        const key = this.key(k);
        if (typeof this.obj[key] === 'undefined'){
            return '';
        }
        return this.obj[key] ;
    }
}

interface CurrentStatus{
    PowerOn: boolean;
    CurrentIdent: CharacteristicValue;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MITVPlatformAccessory {
  private service: Service;

  private keyMap : KeyMap = new KeyMap();


  private miClient: MIApiClient;

  private requestLoopCountDown = 30;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private currentStates : CurrentStatus= {
      PowerOn: false,
      CurrentIdent: 10,
  };

  constructor(
    private readonly platform: MITVHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

      this.initKeyMap();
      this.requestLoopCountDownDefault();

      const deviceConfig = this.accessory.context.device;
      this.miClient = new MIApiClient(deviceConfig.ip, deviceConfig.port, this.platform.log);


    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
        .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
        .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');


    // television service
    this.service = this.getService(this.platform.Service.Television, 'tv_default', 'tv_default');
    this.service.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.currentStates.CurrentIdent);
    this.service.updateCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.context.device.title);
    this.service.updateCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);


    //
    this.service.getCharacteristic(this.platform.Characteristic.Active)
        .onGet(()=>{

            // 应该是 homebridge 在检查状态
            const isPowerOn = this.currentStates.PowerOn;
            this.platform.log.debug('get powerOn status: ', isPowerOn);
            return isPowerOn;
        }).onSet(async(v)=>{
            this.platform.log.info('set tv poweron by button: ', v);


            if(v===0){
                await this.doPowerOff();
            }else{

                await this.doPowerOn();
            }

            //
        });

    this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .onGet(()=>{
            const heh = this.currentStates.CurrentIdent;
            this.platform.log.debug('get ActiveIdentifier value: ', heh);
            return heh;
        }).onSet(async(v)=>{
            this.platform.log.info('set ActiveIdentifier: %v', v);
            let hdmi = '';


            try{

                switch(v){
                    case 11:
                        hdmi = 'hdmi1';
                        break;
                    case 12:
                        hdmi = 'hdmi2';
                        break;
                    case 13:
                        hdmi = 'hdmi3';
                        break;
                    default:
                        await this.execApi(new EventKeyAdapter('home'));
                        //
                        return;
                }

                this.currentStates.CurrentIdent = v;
                await this.execApi(new CheckSourceAdapter(hdmi));

            }catch(err){
                this.platform.log.error('checksource err: ', err);
            }
        });


    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey)
        .onSet(async (keyValue)=>{
            this.platform.log.debug('remote control press, key is: ', keyValue);

            const key = this.keyMap.get(keyValue);
            if(''===key){
                return;
            }

            try{
                const ada = await this.doKeyCode(key);
                this.platform.log.debug('do remoteKey: ', ada);
            }catch(err){
                this.platform.log.error('do remoteKey err', err);
            }

        });


    // speaker
    const speakerService = this.getService(this.platform.Service.TelevisionSpeaker, 'speaker', 'speaker');
    speakerService
        .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
        .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);

    speakerService.getCharacteristic(this.platform.Characteristic.Mute)
        .onSet((v)=>{
            this.platform.log.info('speaker set mute: ', v);
        }).onGet(()=>{
            this.platform.log.info('speaker get mute: ');
            return false;
        });
    // handle volume control
    speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
        .onSet(async(newValue) => {
            this.platform.log.info('set VolumeSelector => setNewValue: ' + newValue);
            // 0 调大
            // 1 调小

            let key = '';
            if(0===newValue){
                key='volumeup';
            }else if(1===newValue){
                key='volumedown';

            }else{
                return;
            }

            try{
                const ada = await this.doKeyCode(key);
                this.platform.log.debug('change volume adapter: ', ada);
            }catch(err){
                this.platform.log.error('change volume error: ', err);
            }
        });
    speakerService.getCharacteristic(this.platform.Characteristic.Active)
        .onSet((newValue) => {
            // 理论上这个没有用，不晓得是不是指 静音
            this.platform.log.info('speaker set active => setNewValue: ' + newValue);
        })
        .onGet(()=> {
            const isPowerOn = this.currentStates.PowerOn;
            this.platform.log.debug('speaker get active => setNewValue: ', isPowerOn);
            return isPowerOn;
        });



    const hdmi0InputService = this.getService(this.platform.Service.InputSource, 'hdmi0', 'HDMI 0');

    hdmi0InputService
        .setCharacteristic(this.platform.Characteristic.Identifier, 10)  // 相当于 select 的 value
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, '电视主屏')
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HOME_SCREEN);
    this.service.addLinkedService(hdmi0InputService); // link to tv service

    const hdmi1InputService = this.getService(this.platform.Service.InputSource, 'hdmi1', 'HDMI 1');
    hdmi1InputService
        .setCharacteristic(this.platform.Characteristic.Identifier, 11)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'HDMI 1')
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HDMI);
    this.service.addLinkedService(hdmi1InputService); // link to tv service

    // HDMI 2 Input Source
    const hdmi2InputService = this.getService(this.platform.Service.InputSource, 'hdmi2', 'HDMI 2');
    hdmi2InputService
        .setCharacteristic(this.platform.Characteristic.Identifier, 12)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'HDMI 2')
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HDMI);
    this.service.addLinkedService(hdmi2InputService); // link to tv service

    const hdmi3InputService = this.getService(this.platform.Service.InputSource, 'hdmi3', 'HDMI 3');
    hdmi3InputService
        .setCharacteristic(this.platform.Characteristic.Identifier, 13)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'HDMI 3')
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HDMI);
    this.service.addLinkedService(hdmi3InputService); // link to tv service

    setInterval(async() => {
        //
        // 如果 powerOn == false return
        if(!this.currentStates.PowerOn){

            return;
        }

        if(this.requestLoopCountDown<0){
            return;
        }

        this.requestLoopCountDown--;

        if(this.requestLoopCountDown===5){
            //
            try{
                const adp = new AlivedAdapter();
                await this.execApi(adp);
            }catch(err){
                this.platform.log.debug('err: ', err);
            }
        }else if(this.requestLoopCountDown===0){
            //
            if (!this.currentStates.PowerOn){
                // power off
                this.service.getCharacteristic(this.platform.Characteristic.Active);
            }
        }

    }, 10000);
  }

  getService(defaultService :typeof Service, name:string, desc:string ):Service{
      const device = this.accessory.context.device;
      const p = `MITV-${device.title}-${device.ip}-${device.port}-`;
      const fullName = p + name;
      const fullDesc = p + desc;

      const service = this.accessory.getService(fullName) || this.accessory.addService(defaultService, fullName, fullDesc);
      return service;
  }

  requestLoopCountDownDefault(){
      this.requestLoopCountDown = 20;
  }

  async doPowerOn(){
      // 目前，没有方法打开电视，所以
      try{
          await this.execApi(new AlivedAdapter());
          this.currentStates.PowerOn = true;
      }catch(err){
          this.currentStates.PowerOn = false;
      }
  }

  async doPowerOff(){
      try{
          await this.execApi(new AlivedAdapter());

          // 只有正常情况下，才执行power
          await this.execApi(new EventKeyAdapter('power'));
          this.currentStates.PowerOn = false;
      }catch(err){
          this.currentStates.PowerOn = false;
      }
  }


  async execApi(adapter :ApiAdapter){
      await this.miClient.exec(adapter);

      // set 重置倒计时
      this.requestLoopCountDownDefault();

  }

  async doKeyCode(keyCode:string): Promise<EventKeyAdapter>{

      const adp = new EventKeyAdapter(keyCode);
      await this.execApi(adp);
      return adp;
  }

  private initKeyMap(){
      this.keyMap.set(this.platform.Characteristic.RemoteKey.ARROW_UP, 'up');
      this.keyMap.set(this.platform.Characteristic.RemoteKey.ARROW_DOWN, 'down');
      this.keyMap.set(this.platform.Characteristic.RemoteKey.ARROW_LEFT, 'left');
      this.keyMap.set(this.platform.Characteristic.RemoteKey.ARROW_RIGHT, 'right');

      this.keyMap.set(this.platform.Characteristic.RemoteKey.SELECT, 'enter');

      this.keyMap.set(this.platform.Characteristic.RemoteKey.BACK, 'back');
      this.keyMap.set(this.platform.Characteristic.RemoteKey.INFORMATION, 'menu');
      this.keyMap.set(this.platform.Characteristic.RemoteKey.PLAY_PAUSE, 'home');

  }

}
