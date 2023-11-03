export interface Config {
  /**
   * A list of forwarding-proxies. Each key is a route to match,
   * below the prefix that the proxy plugin is mounted on. It must
   * start with a '/'.
   */
  proxysigv4?: {
    [key: string]:
      | string
      | {
          /**
           * Target of the proxy. Url string to be parsed with the url module.
           */
          target: string;
          /**
           * Use credentials for this IAM Role ARN via STS:AssumeRole call when signing the request.
           */
          roleArn?: string;
          /**
           * Use this session name when performing the STS:AssumeRole call for roleArn. Default: 'tempAssumeRoleSession'.
           */
          roleSessionName?: string;
        };
  };
}
