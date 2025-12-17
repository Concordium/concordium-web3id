import { useState } from 'react';
import { StatementTypes, AtomicStatementV2 } from '@concordium/web-sdk';
import { ProofDetailsProps, Proof, ProofType } from '../types';

function ProofDetails({ proof, isOpen, onClose }: ProofDetailsProps) {
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

  if (!isOpen || !proof) return null;

  const proofSize = new TextEncoder().encode(proof.toString()).length;

  return viewMode === 'raw'
    ? renderRawView(proof, proofSize, onClose, () => setViewMode('structured'))
    : renderStructuredView(proof, proofSize, onClose, () => setViewMode('raw'));
}

// Helper functions
const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
};

function getProofType(proof: Proof) {
  switch (proof.type) {
    case ProofType.VerifiablePresentationV1:
      return proof.value.toJSON().type;
    case ProofType.VerifiablePresentation:
      return proof.value.type;
    default:
      throw new Error('Not supported proof type.');
  }
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "—";

  if (typeof value === 'object') {
    // Handle TimestampAttribute
    if (value.type === 'date-time' && value.timestamp) {
      return formatDate(value.timestamp);
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return String(value);
};

// Improved TruncatedText with more information
const TruncatedText = ({ text, maxLength = 40 }: { text: string, maxLength?: number }) => {
  const [expanded, setExpanded] = useState(false);

  if (!text || text.length <= maxLength) return <span>{text}</span>;

  return (
    <div className="text-break">
      {expanded ? (
        <>
          <span style={{ wordBreak: 'break-all' }}>{text}</span>
          <button
            className="btn btn-link p-0 ms-1 text-decoration-none d-block mt-1"
            onClick={() => setExpanded(false)}
          >
            [Show Less]
          </button>
        </>
      ) : (
        <>
          {text.substring(0, maxLength)}...
          <button
            className="btn btn-link p-0 ms-1 text-decoration-none"
            onClick={() => setExpanded(true)}
          >
            [Show More] ({text.length} chars)
          </button>
        </>
      )}
    </div>
  );
};

// Section title component
const SectionTitle = ({ title, className = "" }: { title: string, className?: string }) => (
  <h6 className={`bg-light p-2 rounded mb-3 ${className}`}>{title}</h6>
);

// Badge for credential types
const TypeBadge = ({ type }: { type: string }) => {
  let bgClass = "bg-secondary";

  switch (type.toLowerCase()) {
    case "verifiablepresentation":
    case "verifiable presentation":
      bgClass = "bg-primary";
      break;
    case "verifiablecredential":
    case "verifiable credential":
      bgClass = "bg-success";
      break;
    case "web3idproof":
      bgClass = "bg-info";
      break;
    case "revealattribute":
      bgClass = "bg-info";
      break;
    case "attributeinrange":
      bgClass = "bg-warning text-dark";
      break;
    case "attributeinset":
      bgClass = "bg-success";
      break;
    case "attributenotinset":
      bgClass = "bg-danger";
      break;
  }

  return <span className={`badge ${bgClass} me-1`}>{type}</span>;
};

// Statement renderer
const renderStatement = (statement: AtomicStatementV2 | any) => {
  switch (statement.type) {
    case StatementTypes.RevealAttribute:
      return (
        <div className="p-2 border-start border-info border-3 ps-3 mb-2">
          <div><strong>Type:</strong> <span className="badge bg-info">Reveal Attribute</span></div>
          <div><strong>Attribute:</strong> {statement.attributeTag}</div>
          {statement.revealed && (
            <div className="mt-2">
              <strong>Revealed Value:</strong> {formatValue(statement.revealed)}
            </div>
          )}
        </div>
      );
    case StatementTypes.AttributeInRange:
      return (
        <div className="p-2 border-start border-warning border-3 ps-3 mb-2">
          <div><strong>Type:</strong> <span className="badge bg-warning text-dark">Attribute In Range</span></div>
          <div><strong>Attribute:</strong> {statement.attributeTag}</div>
          <div><strong>Lower Bound:</strong> {formatValue(statement.lower)}</div>
          <div><strong>Upper Bound:</strong> {formatValue(statement.upper)}</div>
        </div>
      );
    case StatementTypes.AttributeInSet:
      return (
        <div className="p-2 border-start border-success border-3 ps-3 mb-2">
          <div><strong>Type:</strong> <span className="badge bg-success">Attribute In Set</span></div>
          <div><strong>Attribute:</strong> {statement.attributeTag}</div>
          <div><strong>Set:</strong> {Array.isArray(statement.set)
            ? statement.set.map(formatValue).join(', ')
            : formatValue(statement.set)}</div>
        </div>
      );
    case StatementTypes.AttributeNotInSet:
      return (
        <div className="p-2 border-start border-danger border-3 ps-3 mb-2">
          <div><strong>Type:</strong> <span className="badge bg-danger">Attribute Not In Set</span></div>
          <div><strong>Attribute:</strong> {statement.attributeTag}</div>
          <div><strong>Set:</strong> {Array.isArray(statement.set)
            ? statement.set.map(formatValue).join(', ')
            : formatValue(statement.set)}</div>
        </div>
      );
    default:
      return (
        <div className="p-2 border-start border-secondary border-3 ps-3 mb-2">
          <div><strong>Type:</strong> <span className="badge bg-secondary">{statement.type}</span></div>
          <pre className="my-2 bg-light p-2 rounded small">
            {JSON.stringify(statement, null, 2)}
          </pre>
        </div>
      );
  }
};

// Renders individual proof items
const renderProofItem = (proofItem: any, index: number) => {
  return (
    <div key={index} className="mb-2 pb-2 border-bottom">
      {proofItem.type && (
        <div className="mb-2">
          <strong>Type:</strong> <TypeBadge type={proofItem.type} />
        </div>
      )}

      {proofItem.attribute && (
        <div className="mb-2">
          <strong>Attribute:</strong> {proofItem.attribute}
        </div>
      )}

      {/* Show specific fields based on proof type */}
      {proofItem.type === 'AttributeInRange' && (
        <>
          {proofItem.lower !== undefined && (
            <div className="mb-2">
              <strong>Lower Bound:</strong> {formatValue(proofItem.lower)}
            </div>
          )}
          {proofItem.upper !== undefined && (
            <div className="mb-2">
              <strong>Upper Bound:</strong> {formatValue(proofItem.upper)}
            </div>
          )}
        </>
      )}

      {proofItem.type === 'AttributeInSet' && proofItem.set !== undefined && (
        <div className="mb-2">
          <strong>Set:</strong> {
            Array.isArray(proofItem.set)
              ? proofItem.set.map(formatValue).join(', ')
              : formatValue(proofItem.set)
          }
        </div>
      )}

      {proofItem.type === 'AttributeNotInSet' && proofItem.set !== undefined && (
        <div className="mb-2">
          <strong>Set:</strong> {
            Array.isArray(proofItem.set)
              ? proofItem.set.map(formatValue).join(', ')
              : formatValue(proofItem.set)
          }
        </div>
      )}

      {proofItem.proof && (
        <div className="mb-2">
          <strong>Proof:</strong>
          <TruncatedText text={proofItem.proof} maxLength={40} />
        </div>
      )}
    </div>
  );
};

// Raw data view 
const renderRawView = (
  proof: Proof,
  proofSize: number,
  onClose: () => void,
  onSwitchView?: () => void
) => (
  <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
    style={{ zIndex: 1050, backgroundColor: 'rgba(0,0,0,0.5)' }}>
    <div className="bg-white p-4 rounded shadow-lg"
      style={{ maxWidth: '90%', maxHeight: '90%', width: '800px', overflow: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="m-0">Proof Raw Data</h4>
        <button type="button" className="btn-close" onClick={onClose}></button>
      </div>

      <div className="d-flex justify-content-between mb-3">
        <span className="text-muted">Size: {formatSize(proofSize)} ({proof.toString().length} characters)</span>
        {onSwitchView && (
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={onSwitchView}
          >
            Switch to Structured View
          </button>
        )}
      </div>

      <pre className="bg-light p-3 rounded small"
        style={{ maxHeight: '70vh', overflow: 'auto', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(proof.value, null, 2)}
      </pre>

      <div className="d-flex justify-content-between mt-3">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => {
            navigator.clipboard.writeText(proof.toString());
            alert('Proof copied to clipboard');
          }}
        >
          Copy to Clipboard
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
);

// Structured view
const renderStructuredView = (
  proof: Proof,
  proofSize: number,
  onClose: () => void,
  onSwitchView?: () => void
) => {
  // Render credential section
  const renderCredential = (credential: any) => {
    const { credentialSubject, issuer, type } = credential;

    return (
      <div className="border rounded p-3 bg-white shadow-sm mb-3">
        <div className="mb-3">
          <strong>Issuer:</strong> <TruncatedText text={issuer} />
        </div>
        <div className="mb-3">
          <strong>Type:</strong>{' '}
          {Array.isArray(type)
            ? type.map((t, i) => <TypeBadge key={i} type={t} />)
            : <TypeBadge type={String(type)} />}
        </div>
        <div className="mb-3">
          <strong>Credential Subject ID:</strong> <TruncatedText text={credentialSubject.id} />
        </div>
        {credentialSubject && (
          <div className="mt-4 border-top pt-1">

            {/* Statement section */}
            {credentialSubject.statement && (
              <div className="mt-2">
                <SectionTitle title="Statements" />
                <div className="ps-2">
                  {Array.isArray(credentialSubject.statement)
                    ? credentialSubject.statement.map((stmt: any, i: number) => (
                      <div key={i}>{renderStatement(stmt)}</div>
                    ))
                    : renderStatement(credentialSubject.statement)
                  }
                </div>
              </div>
            )}

            {/* Proof section */}
            {credentialSubject.proof && (
              <div className="mt-4">
                <SectionTitle title="Proof" />
                <div className="ps-2">
                  <div className="mb-2">
                    <strong>Type:</strong> {credentialSubject.proof.type}
                  </div>
                  {credentialSubject.proof.created && (
                    <div className="mb-2">
                      <strong>Created:</strong> {formatDate(credentialSubject.proof.created)}
                    </div>
                  )}
                  {credentialSubject.proof.proofValue && (
                    <div className="mb-2">
                      <strong>Proof Value:</strong>
                      <div className="ps-3 mt-1">
                        {Array.isArray(credentialSubject.proof.proofValue)
                          ? credentialSubject.proof.proofValue.map((item: any, i: number) => renderProofItem(item, i))
                          : <TruncatedText
                            text={typeof credentialSubject.proof.proofValue === 'string'
                              ? credentialSubject.proof.proofValue
                              : JSON.stringify(credentialSubject.proof.proofValue)}
                            maxLength={50}
                          />
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  let proofType = getProofType(proof);

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
      style={{ zIndex: 1050, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-light p-4 rounded shadow-lg"
        style={{ maxWidth: '95%', maxHeight: '95%', width: '900px', overflow: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="m-0">Verifiable Presentation</h4>
          <div>
            {onSwitchView && (
              <button
                className="btn btn-sm btn-outline-primary me-2"
                onClick={onSwitchView}
              >
                View Raw Data
              </button>
            )}
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
        </div>

        <div className="small text-muted mb-2">
          Proof size: {formatSize(proofSize)} ({proof.toString().length} characters)
        </div>

        {/* Basic info */}
        <div className="mb-3 p-3 bg-white rounded shadow-sm">
          {proof.value.presentationContext && (
            <div className="mb-3">
              <strong>Presentation Context:</strong>{' '}
              <pre className="my-2 bg-light p-2 rounded small">
                {JSON.stringify(proof.value.presentationContext, null, 2)}
              </pre>
            </div>
          )}
          {/* TODO: display type of proof*/}
          {proofType && (
            <div className="mb-3">
              <strong>Type:</strong>{' '}
              {Array.isArray(proofType)
                ? proofType.map((t: string, i: number) => <TypeBadge key={i} type={t} />)
                : <TypeBadge type={proofType} />
              }
            </div>
          )}
        </div>

        {/* Verifiable credentials */}
        {proof.value.verifiableCredential && proof.value.verifiableCredential.length > 0 && (
          <div className="mb-3">
            <h5 className="mb-3">Verifiable Credentials</h5>
            {proof.value.verifiableCredential.map((credential: any, index: number) => (
              <div key={index}>
                {renderCredential(credential)}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="d-flex justify-content-between mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              navigator.clipboard.writeText(proof.toString());
              alert('Proof copied to clipboard');
            }}
          >
            Copy Raw Data
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default ProofDetails;