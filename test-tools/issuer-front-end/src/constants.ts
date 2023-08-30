import { BrowserWalletConnector, ephemeralConnectorType } from '@concordium/react-components';
import moment from 'moment';

export const EXAMPLE_CREDENTIAL_SCHEMA = `https://raw.githubusercontent.com/Concordium/concordium-web3id/ac803895b1ffaa50888cfc6667331f6ebb0b889e/examples/json-schemas/education-certificate/JsonSchema2023-education-certificate.json`;

export const EXAMPLE_CREDENTIAL_METADATA = `https://gist.githubusercontent.com/abizjak/ff1e90d82c5446c0e001ee6d4e33ea6b/raw/4528363aff42e3ff36b50a1d873287f2f520d610/metadata.json`;

export const EXAMPLE_ISSUER_METADATA = `https://gist.githubusercontent.com/DOBEN/d12deee42e06601efb72859da9be5759/raw/137a9a4b9623dfe16fa8e9bb7ab07f5858d92c53/gistfile1.txt`;

export const DEFAULT_CREDENTIAL_TYPES = ['VerifiableCredential', 'ConcordiumVerifiableCredential'];

export function getBackendApi(): string {
    if (process.env.BACKEND_API) {
        return process.env.BACKEND_API;
    }
    return window.location.origin;
}

export const REFRESH_INTERVAL = moment.duration(4, 'seconds');

export const BROWSER_WALLET = ephemeralConnectorType(BrowserWalletConnector.create);

// The 'PARAMETER'/'RETURN_VALUE' schemas are created by running the command `cargo concordium --schema-json-out ./` in the `smart-contract` folder.
// This produces an output file in the same folder which those schemas.

export const REGISTRY_CONTRACT_CREDENTIAL_ENTRY_PARAMETER_SCHEMA = 'HiAAAAA';

export const REGISTRY_CONTRACT_CREDENTIAL_ENTRY_RETURN_VALUE_SCHEMA =
    'FAADAAAADwAAAGNyZWRlbnRpYWxfaW5mbxQABQAAAAkAAABob2xkZXJfaWQeIAAAABAAAABob2xkZXJfcmV2b2NhYmxlAQoAAAB2YWxpZF9mcm9tDQsAAAB2YWxpZF91bnRpbBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAA0MAAAAbWV0YWRhdGFfdXJsFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAAAoAAABzY2hlbWFfcmVmFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAAEAAAAHJldm9jYXRpb25fbm9uY2UF';

export const REGISTRY_CONTRACT_REGISTRY_METADATA_RETURN_VALUE_SCHEMA =
    'FAADAAAADwAAAGlzc3Vlcl9tZXRhZGF0YRQAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAAPAAAAY3JlZGVudGlhbF90eXBlFAABAAAADwAAAGNyZWRlbnRpYWxfdHlwZRYAEQAAAGNyZWRlbnRpYWxfc2NoZW1hFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAA';

// The 'BASE_64_SCHEMA' is created by running the command `cargo concordium --schema-base64-out -` in the `smart-contract` folder.
// This command prints the below schema to the console.
export const CREDENTIAL_REGISTRY_BASE_64_SCHEMA =
    '//8DAQAAABMAAABjcmVkZW50aWFsX3JlZ2lzdHJ5AQAUAAYAAAAPAAAAaXNzdWVyX21ldGFkYXRhFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAAA8AAABjcmVkZW50aWFsX3R5cGUUAAEAAAAPAAAAY3JlZGVudGlhbF90eXBlFgAGAAAAc2NoZW1hFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAADgAAAGlzc3Vlcl9hY2NvdW50FQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAACwoAAABpc3N1ZXJfa2V5HiAAAAAPAAAAcmV2b2NhdGlvbl9rZXlzEAAeIAAAABEAAAAPAAAAY3JlZGVudGlhbEVudHJ5Bh4gAAAAFAADAAAADwAAAGNyZWRlbnRpYWxfaW5mbxQABQAAAAkAAABob2xkZXJfaWQeIAAAABAAAABob2xkZXJfcmV2b2NhYmxlAQoAAAB2YWxpZF9mcm9tDQsAAAB2YWxpZF91bnRpbBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAA0MAAAAbWV0YWRhdGFfdXJsFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAAAoAAABzY2hlbWFfcmVmFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAAEAAAAHJldm9jYXRpb25fbm9uY2UFFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAhAAAABjcmVkZW50aWFsU3RhdHVzBh4gAAAAFQQAAAAGAAAAQWN0aXZlAgcAAABSZXZva2VkAgcAAABFeHBpcmVkAgwAAABOb3RBY3RpdmF0ZWQCFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAgYAAABpc3N1ZXIFHiAAAAAVEAAAABAAAABQYXJzZVBhcmFtc0Vycm9yAhIAAABDcmVkZW50aWFsTm90Rm91bmQCFwAAAENyZWRlbnRpYWxBbHJlYWR5RXhpc3RzAh8AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXZvY2F0aW9uAh4AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXN0b3JpbmcCEAAAAEtleUFscmVhZHlFeGlzdHMCDwAAAEtleURvZXNOb3RFeGlzdAINAAAATm90QXV0aG9yaXplZAINAAAATm9uY2VNaXNtYXRjaAINAAAAV3JvbmdDb250cmFjdAIPAAAAV3JvbmdFbnRyeXBvaW50AhAAAABFeHBpcmVkU2lnbmF0dXJlAg4AAABXcm9uZ1NpZ25hdHVyZQISAAAAU2VyaWFsaXphdGlvbkVycm9yAgcAAABMb2dGdWxsAgwAAABMb2dNYWxmb3JtZWQCEgAAAHJlZ2lzdGVyQ3JlZGVudGlhbAQUAAIAAAAPAAAAY3JlZGVudGlhbF9pbmZvFAAFAAAACQAAAGhvbGRlcl9pZB4gAAAAEAAAAGhvbGRlcl9yZXZvY2FibGUBCgAAAHZhbGlkX2Zyb20NCwAAAHZhbGlkX3VudGlsFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAADQwAAABtZXRhZGF0YV91cmwUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAADgAAAGF1eGlsaWFyeV9kYXRhEAECFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAhYAAAByZWdpc3RlclJldm9jYXRpb25LZXlzBBQAAgAAAAQAAABrZXlzEAEeIAAAAA4AAABhdXhpbGlhcnlfZGF0YRABAhUQAAAAEAAAAFBhcnNlUGFyYW1zRXJyb3ICEgAAAENyZWRlbnRpYWxOb3RGb3VuZAIXAAAAQ3JlZGVudGlhbEFscmVhZHlFeGlzdHMCHwAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJldm9jYXRpb24CHgAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJlc3RvcmluZwIQAAAAS2V5QWxyZWFkeUV4aXN0cwIPAAAAS2V5RG9lc05vdEV4aXN0Ag0AAABOb3RBdXRob3JpemVkAg0AAABOb25jZU1pc21hdGNoAg0AAABXcm9uZ0NvbnRyYWN0Ag8AAABXcm9uZ0VudHJ5cG9pbnQCEAAAAEV4cGlyZWRTaWduYXR1cmUCDgAAAFdyb25nU2lnbmF0dXJlAhIAAABTZXJpYWxpemF0aW9uRXJyb3ICBwAAAExvZ0Z1bGwCDAAAAExvZ01hbGZvcm1lZAIQAAAAcmVnaXN0cnlNZXRhZGF0YQUUAAMAAAAPAAAAaXNzdWVyX21ldGFkYXRhFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAAA8AAABjcmVkZW50aWFsX3R5cGUUAAEAAAAPAAAAY3JlZGVudGlhbF90eXBlFgARAAAAY3JlZGVudGlhbF9zY2hlbWEUAAEAAAAKAAAAc2NoZW1hX3JlZhQAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAAVEAAAABAAAABQYXJzZVBhcmFtc0Vycm9yAhIAAABDcmVkZW50aWFsTm90Rm91bmQCFwAAAENyZWRlbnRpYWxBbHJlYWR5RXhpc3RzAh8AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXZvY2F0aW9uAh4AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXN0b3JpbmcCEAAAAEtleUFscmVhZHlFeGlzdHMCDwAAAEtleURvZXNOb3RFeGlzdAINAAAATm90QXV0aG9yaXplZAINAAAATm9uY2VNaXNtYXRjaAINAAAAV3JvbmdDb250cmFjdAIPAAAAV3JvbmdFbnRyeXBvaW50AhAAAABFeHBpcmVkU2lnbmF0dXJlAg4AAABXcm9uZ1NpZ25hdHVyZQISAAAAU2VyaWFsaXphdGlvbkVycm9yAgcAAABMb2dGdWxsAgwAAABMb2dNYWxmb3JtZWQCFAAAAHJlbW92ZVJldm9jYXRpb25LZXlzBBQAAgAAAAQAAABrZXlzEAEeIAAAAA4AAABhdXhpbGlhcnlfZGF0YRABAhUQAAAAEAAAAFBhcnNlUGFyYW1zRXJyb3ICEgAAAENyZWRlbnRpYWxOb3RGb3VuZAIXAAAAQ3JlZGVudGlhbEFscmVhZHlFeGlzdHMCHwAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJldm9jYXRpb24CHgAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJlc3RvcmluZwIQAAAAS2V5QWxyZWFkeUV4aXN0cwIPAAAAS2V5RG9lc05vdEV4aXN0Ag0AAABOb3RBdXRob3JpemVkAg0AAABOb25jZU1pc21hdGNoAg0AAABXcm9uZ0NvbnRyYWN0Ag8AAABXcm9uZ0VudHJ5cG9pbnQCEAAAAEV4cGlyZWRTaWduYXR1cmUCDgAAAFdyb25nU2lnbmF0dXJlAhIAAABTZXJpYWxpemF0aW9uRXJyb3ICBwAAAExvZ0Z1bGwCDAAAAExvZ01hbGZvcm1lZAIRAAAAcmVzdG9yZUNyZWRlbnRpYWwEFAACAAAADQAAAGNyZWRlbnRpYWxfaWQeIAAAAAYAAAByZWFzb24VAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAUAAEAAAAGAAAAcmVhc29uFgAVEAAAABAAAABQYXJzZVBhcmFtc0Vycm9yAhIAAABDcmVkZW50aWFsTm90Rm91bmQCFwAAAENyZWRlbnRpYWxBbHJlYWR5RXhpc3RzAh8AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXZvY2F0aW9uAh4AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXN0b3JpbmcCEAAAAEtleUFscmVhZHlFeGlzdHMCDwAAAEtleURvZXNOb3RFeGlzdAINAAAATm90QXV0aG9yaXplZAINAAAATm9uY2VNaXNtYXRjaAINAAAAV3JvbmdDb250cmFjdAIPAAAAV3JvbmdFbnRyeXBvaW50AhAAAABFeHBpcmVkU2lnbmF0dXJlAg4AAABXcm9uZ1NpZ25hdHVyZQISAAAAU2VyaWFsaXphdGlvbkVycm9yAgcAAABMb2dGdWxsAgwAAABMb2dNYWxmb3JtZWQCDgAAAHJldm9jYXRpb25LZXlzBRACDx4gAAAABRUQAAAAEAAAAFBhcnNlUGFyYW1zRXJyb3ICEgAAAENyZWRlbnRpYWxOb3RGb3VuZAIXAAAAQ3JlZGVudGlhbEFscmVhZHlFeGlzdHMCHwAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJldm9jYXRpb24CHgAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJlc3RvcmluZwIQAAAAS2V5QWxyZWFkeUV4aXN0cwIPAAAAS2V5RG9lc05vdEV4aXN0Ag0AAABOb3RBdXRob3JpemVkAg0AAABOb25jZU1pc21hdGNoAg0AAABXcm9uZ0NvbnRyYWN0Ag8AAABXcm9uZ0VudHJ5cG9pbnQCEAAAAEV4cGlyZWRTaWduYXR1cmUCDgAAAFdyb25nU2lnbmF0dXJlAhIAAABTZXJpYWxpemF0aW9uRXJyb3ICBwAAAExvZ0Z1bGwCDAAAAExvZ01hbGZvcm1lZAIWAAAAcmV2b2tlQ3JlZGVudGlhbEhvbGRlcgQUAAIAAAAJAAAAc2lnbmF0dXJlHkAAAAAEAAAAZGF0YRQAAwAAAA0AAABjcmVkZW50aWFsX2lkHiAAAAAMAAAAc2lnbmluZ19kYXRhFAAEAAAAEAAAAGNvbnRyYWN0X2FkZHJlc3MMCwAAAGVudHJ5X3BvaW50FgEFAAAAbm9uY2UFCQAAAHRpbWVzdGFtcA0GAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYAFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAhYAAAByZXZva2VDcmVkZW50aWFsSXNzdWVyBBQAAwAAAA0AAABjcmVkZW50aWFsX2lkHiAAAAAGAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYADgAAAGF1eGlsaWFyeV9kYXRhEAECFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAhUAAAByZXZva2VDcmVkZW50aWFsT3RoZXIEFAACAAAACQAAAHNpZ25hdHVyZR5AAAAABAAAAGRhdGEUAAQAAAANAAAAY3JlZGVudGlhbF9pZB4gAAAADAAAAHNpZ25pbmdfZGF0YRQABAAAABAAAABjb250cmFjdF9hZGRyZXNzDAsAAABlbnRyeV9wb2ludBYBBQAAAG5vbmNlBQkAAAB0aW1lc3RhbXANDgAAAHJldm9jYXRpb25fa2V5HiAAAAAGAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYAFRAAAAAQAAAAUGFyc2VQYXJhbXNFcnJvcgISAAAAQ3JlZGVudGlhbE5vdEZvdW5kAhcAAABDcmVkZW50aWFsQWxyZWFkeUV4aXN0cwIfAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmV2b2NhdGlvbgIeAAAASW5jb3JyZWN0U3RhdHVzQmVmb3JlUmVzdG9yaW5nAhAAAABLZXlBbHJlYWR5RXhpc3RzAg8AAABLZXlEb2VzTm90RXhpc3QCDQAAAE5vdEF1dGhvcml6ZWQCDQAAAE5vbmNlTWlzbWF0Y2gCDQAAAFdyb25nQ29udHJhY3QCDwAAAFdyb25nRW50cnlwb2ludAIQAAAARXhwaXJlZFNpZ25hdHVyZQIOAAAAV3JvbmdTaWduYXR1cmUCEgAAAFNlcmlhbGl6YXRpb25FcnJvcgIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAh8AAABzZXJpYWxpemF0aW9uSGVscGVySG9sZGVyUmV2b2tlABQAAwAAAA0AAABjcmVkZW50aWFsX2lkHiAAAAAMAAAAc2lnbmluZ19kYXRhFAAEAAAAEAAAAGNvbnRyYWN0X2FkZHJlc3MMCwAAAGVudHJ5X3BvaW50FgEFAAAAbm9uY2UFCQAAAHRpbWVzdGFtcA0GAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYAHgAAAHNlcmlhbGl6YXRpb25IZWxwZXJPdGhlclJldm9rZQAUAAQAAAANAAAAY3JlZGVudGlhbF9pZB4gAAAADAAAAHNpZ25pbmdfZGF0YRQABAAAABAAAABjb250cmFjdF9hZGRyZXNzDAsAAABlbnRyeV9wb2ludBYBBQAAAG5vbmNlBQkAAAB0aW1lc3RhbXANDgAAAHJldm9jYXRpb25fa2V5HiAAAAAGAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYAGAAAAHVwZGF0ZUNyZWRlbnRpYWxNZXRhZGF0YQQQAhQAAgAAAA0AAABjcmVkZW50aWFsX2lkHiAAAAAMAAAAbWV0YWRhdGFfdXJsFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAABUQAAAAEAAAAFBhcnNlUGFyYW1zRXJyb3ICEgAAAENyZWRlbnRpYWxOb3RGb3VuZAIXAAAAQ3JlZGVudGlhbEFscmVhZHlFeGlzdHMCHwAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJldm9jYXRpb24CHgAAAEluY29ycmVjdFN0YXR1c0JlZm9yZVJlc3RvcmluZwIQAAAAS2V5QWxyZWFkeUV4aXN0cwIPAAAAS2V5RG9lc05vdEV4aXN0Ag0AAABOb3RBdXRob3JpemVkAg0AAABOb25jZU1pc21hdGNoAg0AAABXcm9uZ0NvbnRyYWN0Ag8AAABXcm9uZ0VudHJ5cG9pbnQCEAAAAEV4cGlyZWRTaWduYXR1cmUCDgAAAFdyb25nU2lnbmF0dXJlAhIAAABTZXJpYWxpemF0aW9uRXJyb3ICBwAAAExvZ0Z1bGwCDAAAAExvZ01hbGZvcm1lZAIWAAAAdXBkYXRlQ3JlZGVudGlhbFNjaGVtYQQUAAEAAAAKAAAAc2NoZW1hX3JlZhQAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAAVEAAAABAAAABQYXJzZVBhcmFtc0Vycm9yAhIAAABDcmVkZW50aWFsTm90Rm91bmQCFwAAAENyZWRlbnRpYWxBbHJlYWR5RXhpc3RzAh8AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXZvY2F0aW9uAh4AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXN0b3JpbmcCEAAAAEtleUFscmVhZHlFeGlzdHMCDwAAAEtleURvZXNOb3RFeGlzdAINAAAATm90QXV0aG9yaXplZAINAAAATm9uY2VNaXNtYXRjaAINAAAAV3JvbmdDb250cmFjdAIPAAAAV3JvbmdFbnRyeXBvaW50AhAAAABFeHBpcmVkU2lnbmF0dXJlAg4AAABXcm9uZ1NpZ25hdHVyZQISAAAAU2VyaWFsaXphdGlvbkVycm9yAgcAAABMb2dGdWxsAgwAAABMb2dNYWxmb3JtZWQCFAAAAHVwZGF0ZUlzc3Vlck1ldGFkYXRhBBQAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAAVEAAAABAAAABQYXJzZVBhcmFtc0Vycm9yAhIAAABDcmVkZW50aWFsTm90Rm91bmQCFwAAAENyZWRlbnRpYWxBbHJlYWR5RXhpc3RzAh8AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXZvY2F0aW9uAh4AAABJbmNvcnJlY3RTdGF0dXNCZWZvcmVSZXN0b3JpbmcCEAAAAEtleUFscmVhZHlFeGlzdHMCDwAAAEtleURvZXNOb3RFeGlzdAINAAAATm90QXV0aG9yaXplZAINAAAATm9uY2VNaXNtYXRjaAINAAAAV3JvbmdDb250cmFjdAIPAAAAV3JvbmdFbnRyeXBvaW50AhAAAABFeHBpcmVkU2lnbmF0dXJlAg4AAABXcm9uZ1NpZ25hdHVyZQISAAAAU2VyaWFsaXphdGlvbkVycm9yAgcAAABMb2dGdWxsAgwAAABMb2dNYWxmb3JtZWQCAR8HAAAAAAcAAABSZXN0b3JlAAIAAAAJAAAAaG9sZGVyX2lkHiAAAAAGAAAAcmVhc29uFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAFAABAAAABgAAAHJlYXNvbhYA9A0AAABSZXZvY2F0aW9uS2V5AAIAAAADAAAAa2V5HiAAAAAGAAAAYWN0aW9uFQIAAAAIAAAAUmVnaXN0ZXICBgAAAFJlbW92ZQL1BgAAAFNjaGVtYQACAAAADwAAAGNyZWRlbnRpYWxfdHlwZRQAAQAAAA8AAABjcmVkZW50aWFsX3R5cGUWAAoAAABzY2hlbWFfcmVmFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAA9hIAAABDcmVkZW50aWFsTWV0YWRhdGEAAgAAAA0AAABjcmVkZW50aWFsX2lkHiAAAAAMAAAAbWV0YWRhdGFfdXJsFAACAAAAAwAAAHVybBYBBAAAAGhhc2gVAgAAAAQAAABOb25lAgQAAABTb21lAQEAAAAeIAAAAPcOAAAASXNzdWVyTWV0YWRhdGEAAgAAAAMAAAB1cmwWAQQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAHiAAAAD4BgAAAFJldm9rZQADAAAACQAAAGhvbGRlcl9pZB4gAAAABwAAAHJldm9rZXIVAwAAAAYAAABJc3N1ZXICBgAAAEhvbGRlcgIFAAAAT3RoZXIBAQAAAB4gAAAABgAAAHJlYXNvbhUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAABQAAQAAAAYAAAByZWFzb24WAPkIAAAAUmVnaXN0ZXIABAAAAAkAAABob2xkZXJfaWQeIAAAAAoAAABzY2hlbWFfcmVmFAABAAAACgAAAHNjaGVtYV9yZWYUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAADwAAAGNyZWRlbnRpYWxfdHlwZRQAAQAAAA8AAABjcmVkZW50aWFsX3R5cGUWAAwAAABtZXRhZGF0YV91cmwUAAIAAAADAAAAdXJsFgEEAAAAaGFzaBUCAAAABAAAAE5vbmUCBAAAAFNvbWUBAQAAAB4gAAAA';

export const MODULE_REFERENCE_CREDENTIAL_REGISTRY = 'd89dfffac591f8e8721007ba4140ad9e221e283218d493db41e5b09bdba57c0a';

export const CONTRACT_REGISTRY_NAME = 'credential_registry';

export const CONTRACT_SUB_INDEX = 0n;
