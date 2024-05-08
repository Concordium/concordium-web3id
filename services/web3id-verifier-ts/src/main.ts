import { URL } from 'url';
import { InvalidArgumentError, program, Option } from 'commander';
import { AppConfig, LogLevel } from './types.js';
import { runServer } from './server.js';
import { Network } from '@concordium/web-sdk/types';

/**
 * Parse a network value. The value must be either 'mainnet' or 'testnet'.
 *
 * @param value The value to parse.
 * @throws {InvalidArgumentError} If the value is not a valid network.
 * @returns The parsed network.
 */
function parseNetwork(value: string, _dummyPrevious: any): Network {
    if (['Mainnet', 'Testnet'].includes(value)) {
        return value as Network;
    }
    throw new InvalidArgumentError(`Invalid network value. Expected 'Mainnet' or 'Testnet'.`);
}

/**
 * Parse a log level value. The value must be one of 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.
 *
 * @param value The value to parse.
 * @throws {InvalidArgumentError} If the value is not a valid log level.
 * @returns The parsed log level.
 */
function parseLogLevel(value: string, _dummyPrevious: any): LogLevel {
    if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(value)) {
        return value as LogLevel;
    }
    throw new InvalidArgumentError(
        `Invalid log level. Expected one of 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.`,
    );
}

/**
 * Parse a URL value.
 *
 * @param url The URL to parse. Must have 'http' or 'https' protocol.
 * @throws {InvalidArgumentError} If the URL is invalid.
 * @returns The parsed URL.
 */
function parseUrl(url: string, _dummyPrevious: any): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch (error) {
        throw new InvalidArgumentError(`Invalid URL.`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new InvalidArgumentError(`Invalid URL. Expected 'http' or 'https' protocol.`);
    }
    return parsed;
}

/**
 * Parse a boolean value. The value must be either 'true' or 'false'.
 *
 * @param value The value to parse.
 * @throws {InvalidArgumentError} If the value is not 'true' or 'false'.
 * @returns The parsed boolean value.
 */
function parseBool(value: string, _dummyPrevious: any): boolean {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new InvalidArgumentError(`Invalid boolean value.`);
}

/**
 * Parse a number value.
 *
 * @param value The value to parse.
 * @throws {InvalidArgumentError} If the value is not a number.
 * @returns The parsed number.
 */
function parseNumber(value: string, _dummyPrevious: any): number {
    const parsed = Number(value);
    if (isNaN(parsed)) {
        throw new InvalidArgumentError(`Invalid number value.`);
    }
    return parsed;
}

program
    .name('web3id-verifier')
    .description('A verifier for Web3ID.')
    .version('0.0.1')
    .addOption(
        new Option('--endpoint <URL>', 'gRPC V2 interface of the node.')
            .default(new URL('http://localhost:20000'))
            .env('CONCORDIUM_WEB3ID_VERIFIER_NODE')
            .argParser(parseUrl),
    )
    .addOption(
        new Option('--listen-address <URL>', 'Listen address for the server.')
            .default(new URL('http://0.0.0.0:8080'))
            .env('CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS')
            .argParser(parseUrl),
    )
    .addOption(
        new Option('--log-level <value>', 'Maximum log level.')
            .default(LogLevel.Info)
            .env('CONCORDIUM_WEB3ID_VERIFIER_LOG_LEVEL')
            .argParser(parseLogLevel),
    )
    .addOption(
        new Option('--log-headers <value>', 'Whether to log headers for requests and responses.')
            .default(true)
            .env('CONCORDIUM_WEB3ID_VERIFIER_LOG_HEADERS')
            .argParser(parseBool),
    )
    .addOption(
        new Option('--request-timeout <value>', 'Request timeout in milliseconds.')
            .default(5000)
            .env('CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT')
            .argParser(parseNumber),
    )
    .addOption(
        new Option('--network <value>', 'Network to which the verifier is connected.')
            .default('Testnet')
            .env('CONCORDIUM_WEB3ID_VERIFIER_NETWORK')
            .argParser(parseNetwork),
    )
    .addOption(
        new Option('--prometheus-address <URL>', 'Address for Prometheus metrics. If not set, metrics are not exposed.')
            .default(null)
            .env('CONCORDIUM_WEB3ID_VERIFIER_PROMETHEUS_ADDRESS')
            .argParser(parseUrl),
    );

// Parse the command line arguments.
program.parse();

// Convert the parsed options to AppConfig.
const appConfig: AppConfig = program.opts();
runServer(appConfig);
