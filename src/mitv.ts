import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import url from 'url';
import { Logger } from 'homebridge';

export interface ApiAdapter {
    uri(): string;

    query(): { [key: string]: string };

    // result()
    setResult(data : any) ;
}


export class AlivedAdapter implements ApiAdapter {
  uri(): string {
    return '/request';
  }

  query(): { [key: string]: string } {
    return {
      'action': 'isalive',
    };
  }

  setResult(data : any) {


    return;
  }
}

export class EventKeyAdapter implements ApiAdapter {
  constructor(public readonly keyCode:string){

  }

  uri(): string {
    return '/controller';
  }

  query(): { [key: string]: string } {
    return {
      'action': 'keyevent',
      'keycode': this.keyCode,
    };
  }

  setResult(data : any) {


    return;
  }
}



export class Client {

  constructor(
        public readonly ip: string,
        public readonly port: number,
        public readonly logger: Logger,
  ) {


  }

  /**
   *
   * @param adaptor
   */
  async exec(adaptor: ApiAdapter) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 500);

    // url

    const a = new url.URL('http://' + this.ip);
    a.port = this.port.toString();
    a.pathname = adaptor.uri();
    const query = a.searchParams;

    const q = adaptor.query();
    for (const k in q){

      query.set(k, q[k]);
    }
    a.search = query.toString();

    const urlFull = a.toString();

    console.log(urlFull);
    this.logger.debug('api url: ', urlFull);
    try {
      const response = await fetch(urlFull, { signal: controller.signal });
      const data :any = await response.json();

      //
      console.log('data: ', data);
      this.logger.debug('api url: ', data);
      if (data.code !== 0){
        throw new Error('api error');
      }


      //   if (data.msg !== 'success'){
      //     throw new Error('api failed');
      //   }


      adaptor.setResult(data.data);

    } catch (error) {

      throw new Error('hehe');
    } finally {
      clearTimeout(timeout);
    }
  }
}



export class MITVHomebridgePlatform {

}

