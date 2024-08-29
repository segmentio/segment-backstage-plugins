export interface Config {
  app: {
    analytics: {
      segment: {
        /**
         * Controls whether the Segment Analytics module is enabled.
         * Defaults to true.
         *
         * @visibility frontend
         */
        enabled?: boolean;

        /**
         * Segment Analytics Write Key. Reference https://segment.com/docs/connections/find-writekey/
         * to find your write key
         *
         * @visibility frontend
         */
        writeKey: string;

        /**
         * Whether to log analytics debug statements to the console.
         * Defaults to false.
         *
         * @visibility frontend
         */
        debug?: boolean;

        /**
         * Prevents events from actually being sent when set to true. Defaults
         * to false.
         *
         * @visibility frontend
         */
        testMode?: boolean;

        /**
         * Configuration options for the Segment Analytics agent.
         *
         * @visibility frontend
         */
        agent?: {
          /**
           * Disables storing any data on the client-side via cookies or localstorage.
           * Defaults to false.
           *
           * @visibility frontend
           */
          disableClientPersistence?: boolean;

          /**
           * Disables automatically converting ISO string event properties into Dates.
           * ISO string to Date conversions occur right before sending events to a classic device mode integration,
           * after any destination middleware have been ran.
           * Defaults to false.
           *
           * @visibility frontend
           */
          disableAutoISOConversion?: boolean;

          /**
           * Whether or not to capture page context early so that it is always up-to-date.
           * Defaults to false.
           *
           * @visibility frontend
           */
          initialPageView?: boolean;
        };
      };
    };
  };
}
