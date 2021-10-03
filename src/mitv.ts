import url from 'url';
import http from 'http';
import { Logger } from 'homebridge';

export interface ApiAdapter {
    uri(): string;

    query(): { [key: string]: string };

    // result()
    /**
     *
     * @param data
     */
    setResult(data);
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

    setResult(data) {

        if (typeof data.msg === 'undefined') {
            return;
        }

        if (data.msg !== 'success') {
            return;
        }
        return;
    }
}

export class EventKeyAdapter implements ApiAdapter {

    private data;
    constructor(public readonly keyCode: string) {

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

    setResult(data) {

        if (typeof data.msg === 'undefined') {
            return;
        }

        if (data.msg !== 'success') {
            return;
        }
        return;
    }
}
export class CheckSourceAdapter implements ApiAdapter {
    constructor(public readonly source: string) {

    }

    uri(): string {
        return '/controller';
    }

    query(): { [key: string]: string } {
        return {
            'action': 'changesource',
            'source': this.source,
        };
    }

    setResult(data) {

        if (typeof data.msg === 'undefined') {
            return;
        }

        if (data.msg !== 'success') {
            return;
        }
        return;
    }
}


async function requestData(urlObj, timeout): Promise<string> {
    timeout = timeout || 1000;
    return new Promise((resolve, reject) => {

        urlObj.timeout = timeout;

        // create a request
        const request = http.request(urlObj, response => {
            // your callback here

            response.on('data', (data) => {
                resolve(data.toString());
            });
        });

        request.on('error', error => {
            reject(error);
        });

        // use its "timeout" event to abort the request
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('timeout'));
        });
        request.end();
    });
}

export class MIApiClient {

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

        // url
        const urlObj = new url.URL('http://' + this.ip);
        urlObj.port = this.port.toString();
        urlObj.pathname = adaptor.uri();
        const query = urlObj.searchParams;

        const queryObj = adaptor.query();
        for (const k in queryObj) {

            query.set(k, queryObj[k]);
        }
        urlObj.search = query.toString();


        try {

            this.logger.debug('miapi request: [', urlObj.toString(), ']');

            const response = await requestData(urlObj, 500);

            const data = JSON.parse(response);

            this.logger.debug('request respose: ', data);

            //
            if (data.status !== 0) {
                throw new Error('api error');
            }

            if (typeof data.data === 'undefined') {
                data['data'] = {};
            }
            adaptor.setResult(data.data);

        } catch (error) {

            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error('unknow error');
            }

        }
    }
}
