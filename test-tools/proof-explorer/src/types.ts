import { AtomicStatementV2, ContractAddress } from "@concordium/web-sdk";

export type TopLevelStatement =
    | { type: 'account'; statement: AccountStatement }
    | { type: 'id'; statement: IdentityCredentialStatement }
    | { type: 'web3id'; statement: Web3IdStatement };

export type TopLevelStatements = TopLevelStatement[];

export interface IdentityCredentialStatement {
    idCred_idps: { name: string; id: number }[];
    statement: AtomicStatementV2[];
}

export interface AccountStatement {
    idps: { name: string; id: number }[];
    statement: AtomicStatementV2[];
}

export interface Web3IdStatement {
    issuers: ContractAddress.Type[];
    statement: AtomicStatementV2[];
}

export interface RevealAttributeProps {
    setStatement: (ns: AtomicStatementV2[]) => void;
    attributeOptions: { value: string; label: string }[];
}

export interface ExtendStatementProps {
    setStatement: (ns: AtomicStatementV2[]) => void;
}

export interface AgeBoundProps extends ExtendStatementProps {
    younger: boolean;
}

export interface SetMembershipProps extends RevealAttributeProps {
    member: boolean;
}

export interface ExtendSetStatementProps extends ExtendStatementProps {
    member: boolean;
    attribute: string;
}

export interface SpecialSetProps extends ExtendStatementProps {
    // if nationality is set then produce statement about EU nationality
    // otherwise about EU residence
    nationality: boolean;
}

export interface ProofDetailsProps {
  proof: string | null;
  isOpen: boolean;
  onClose: () => void;
}