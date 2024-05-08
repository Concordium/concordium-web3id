import { Network } from "@concordium/web-sdk/types";

/**
 * Configuration for the verifier.
 */
export interface AppConfig {
    /** The gRPC V2 interface of the node. */
    endpoint: URL;
    /** The address to listen on for the API. */
    listenAddress: URL;
    /** The maximum log level. */
    logLevel: LogLevel;
    /** Whether to log headers for requests and responses. */
    logHeaders: boolean;
    /** Request timeout in milliseconds. */
    requestTimeout: number;
    /** The network to which the verifier is connected. */
    network: Network;
    /** Address for Prometheus metrics. If not set, metrics are not exposed. */
    prometheusAddress: URL | null;
}

/**
 * Log levels that can be used.
 */
export enum LogLevel {
    Trace = 'trace',
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Fatal = 'fatal',
}
