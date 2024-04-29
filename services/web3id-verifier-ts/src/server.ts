import express, { Request, Response } from 'express';
import { URL } from 'url';
import { InvalidArgumentError, program, Option } from 'commander';
import { ConcordiumGRPCNodeClient, credentials } from '@concordium/web-sdk/nodejs';
import { BlockHash, VerifiablePresentation } from '@concordium/web-sdk';
import bodyParser from 'body-parser';

/**
 * Configuration for the verifier.
 */
interface AppConfig {
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
 * The two possible networks.
 */
enum Network {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

/**
 * Log levels that can be used.
 */
enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

program
    .name('web3id-verifier')
    .description('A verifier for Web3ID.')
    .version('0.0.1')
    .addOption(new Option('--endpoint <URL>', 'gRPC V2 interface of the node.')
      .default(new URL('http://localhost:20000'))
      .env('CONCORDIUM_WEB3ID_VERIFIER_NODE')
      .argParser(parseUrl))
    .addOption(new Option('--listen-address <URL>', 'Listen address for the server.')
      .default(new URL('http://0.0.0.0:8080'))
      .env('CONCORDIUM_WEB3ID_VERIFIER_API_LISTEN_ADDRESS')
      .argParser(parseUrl))
    .addOption(new Option('--log-level <value>', 'Maximum log level.')
      .default(LogLevel.Info)
      .env('CONCORDIUM_WEB3ID_VERIFIER_LOG_LEVEL')
      .argParser(parseLogLevel))
    .addOption(new Option('--log-headers <value>', 'Whether to log headers for requests and responses.')
      .default(true)
      .env('CONCORDIUM_WEB3ID_VERIFIER_LOG_HEADERS')
      .argParser(parseBool))
    .addOption(new Option('--request-timeout <value>', 'Request timeout in milliseconds.')
      .default(5000)
      .env('CONCORDIUM_WEB3ID_VERIFIER_REQUEST_TIMEOUT')
      .argParser(parseNumber))
    .addOption(new Option('--network <value>', 'Network to which the verifier is connected.')
      .default(Network.Testnet)
      .env('CONCORDIUM_WEB3ID_VERIFIER_NETWORK')
      .argParser(parseNetwork))
    .addOption(new Option('--prometheus-address <URL>', 'Address for Prometheus metrics. If not set, metrics are not exposed.')
      .default(null)
      .env('CONCORDIUM_WEB3ID_VERIFIER_PROMETHEUS_ADDRESS')
      .argParser(parseUrl));


/**
 * Parse a network value. The value must be either 'mainnet' or 'testnet'.
 *
 * @param value The value to parse.
 * @throws {InvalidArgumentError} If the value is not a valid network.
 * @returns The parsed network.
 */
function parseNetwork(value: string, _dummyPrevious: any): Network {
  if (['mainnet', 'testnet'].includes(value)) {
    return value as Network;
  }
  throw new InvalidArgumentError(`Invalid network value. Expected 'mainnet' or 'testnet'.`);
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
  throw new InvalidArgumentError(`Invalid log level. Expected one of 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.`);
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
  }
  catch (error) {
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


// Parse the command line arguments.
program.parse();

// Convert the parsed options to AppConfig.
const appConfig = program.opts() as AppConfig;

// Create an Express application.
const app = express();
// Use the body parser middleware.
app.use(bodyParser.json())

// Setup the concordium client.
const concordiumClient = setupConcordiumClient(appConfig.endpoint, appConfig.requestTimeout);

// Define the routes, where /v0/verify is handled by the function verify_presentation.
app.post('/v0/verify', async (req: Request, res: Response) => {
    // Log the request.
    console.log('Request:', req.body);
    // Parse the JSON body as a VerifiablePresentation.
    // Catch the error if the body is not a valid VerifiablePresentation.
    let vp: VerifiablePresentation;
    try {
      // TODO: We are parsing the body into a JSON object, then stringifying it, then parsing it again. This is not efficient.
      //       We should be able to parse the body directly into a VerifiablePresentation.
      vp = VerifiablePresentation.fromString(JSON.stringify(req.body));
      console.log("Verifiable presentation:", vp.toString());

    } catch (error) {
      res.send("Error parsing JSON body as VerifiablePresentation");
      console.log("Error parsing JSON body as VerifiablePresentation:", error);
      return;
    };

    // Get the block info from the node.
    let bi = await concordiumClient.getBlockInfo();

    res.send({
      blockHash: bi.blockHash,
      blockTime: bi.blockSlotTime,
      presentation: vp,
    });
    // Get the public data about the presentation.

    // Check that all credentials in the presentation are active.
    // Verify the presentation.
    // Return a response with the block hash, block time and the presentation.
});

// Start the server
app.listen(appConfig.listenAddress.port, () => {
    // Log all the configuration settings in a nice format.
    console.log('Configuration:', JSON.stringify(appConfig, null, 2));
    console.log(`Server is running on ${appConfig.listenAddress} (port: ${appConfig.listenAddress.port})`);
});

/**
 * Create a new ConcordiumGRPCNodeClient with the provided endpoint.
 * */
function setupConcordiumClient(endpoint: URL, timeout: number): ConcordiumGRPCNodeClient {
  // TODO: Does not seems to work with HTTPS. And the protocol should *not* be part of the address.
  let addr = endpoint.hostname;
  console.log("Setup concordium client:", addr);
  let port = Number(endpoint.port);
  return new ConcordiumGRPCNodeClient(addr, port, credentials.createInsecure(), {timeout: timeout});
}

/** Retrieve and validate credential metadata in a particular block.
 *
 * This does not validate the cryptographic proofs, only the metadata. In
 * particular it checks.
 *
 * - credential exists
 * - the credential's network is as supplied to this function
 * - in case of account credentials, the credential issuer is as stated in the
 *   proof
 * - credential commitments can be correctly parsed
 * - credential is active and not expired at the timestamp of the supplied
 *   block
 * - in case of an account credential, the credential is a normal credential,
 *   and not initial.
 *
 * For web3id credentials the issuer contract is the source of truth, and this
 * function does not perform additional validity checks apart from querying the
 * contract.
 * */
async function verifyCredentialMetadata(
  vp: VerifiablePresentation,
  blockHash: string,
  network: Network,
  block: BlockHash,
): Promise<void> {
   return;
}
