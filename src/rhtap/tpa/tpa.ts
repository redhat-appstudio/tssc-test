// import { KubeClient } from "../../api/ocp/kubeClient";

// export interface TPA {

//     getTufMirrorURL(): Promise<string>;

//     getRokorServerURL(): Promise<string>;

//     getRoxCentralEndpoint(): Promise<string>;
// }

// export class LocalTPA implements TPA {
//     private kubeClient: KubeClient;

//     constructor(kubeClient: KubeClient) {
//         this.kubeClient = kubeClient;
//     }

//     async getTufMirrorURL(): Promise<string> {
//         return this.kubeClient.getOpenshiftRoute()
//     }

//     async getRokorServerURL(): Promise<string> {
//         return this.getEnvVariable('ROKOR_SERVER_URL');
//     }

//     async getRoxCentralEndpoint(): Promise<string> {
//         return this.getEnvVariable('ROX_CENTRAL_ENDPOINT');
//     }
// }