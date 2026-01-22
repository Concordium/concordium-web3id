import { StatementTypes } from '@concordium/web-sdk';
import { TopLevelStatement, TopLevelStatements } from '../../types';

function Issuer({ outerStatement }: { outerStatement: TopLevelStatement }) {
    switch (outerStatement.type) {
        case 'id':
            if (outerStatement.statement.idCred_idps.length == 0) {
                return <div className="bg-danger"> No issuers selected for an identity credential statement. </div>;
            } else {
                return (
                    <div className="bg-info p-1">
                        <p> Statement about an identity credential </p>
                        <p> Allowed issuers </p>
                        <ul>
                            {outerStatement.statement.idCred_idps.map(({ name, id }) => {
                                return <li key={id}> {`${id}:${name}`} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
        case 'account':
            if (outerStatement.statement.idps.length == 0) {
                return <div className="bg-danger"> No issuers selected for an account statement. </div>;
            } else {
                return (
                    <div className="bg-info p-1">
                        <p> Statement about an account credential </p>
                        <p> Allowed issuers </p>
                        <ul>
                            {outerStatement.statement.idps.map(({ name, id }) => {
                                return <li> {`${id}:${name}`} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
        case 'web3id':
            if (outerStatement.statement.issuers.length == 0) {
                return <div className="bg-danger"> No issuers selected for Web3Id credential statement. </div>;
            } else {
                return (
                    <div className="bg-success p-1">
                        <p> Statement about a Web3ID credential </p>
                        <p> Allowed issuers </p>

                        <ul className="bg-success">
                            {outerStatement.statement.issuers.map((inst) => {
                                return <li> {[inst.index, inst.subindex].toString()} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
    }
}
/**
 * Component to display the statement.
 */
export function Statement({ inner, newStatement }: { inner: TopLevelStatements; newStatement: boolean }) {
    const statements = inner.map((outerStatement) => (
        <>
            <Issuer outerStatement={outerStatement} />
            <div>
                {outerStatement.statement.statement.map((s, index) => {
                    switch (s.type) {
                        case StatementTypes.RevealAttribute:
                            return (
                                <div key={index} className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Reveal attribute'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeInRange:
                            return (
                                <div key={index} className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute in range'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Lower: '} {s.lower.toString()}
                                        </p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Upper: '} {s.upper.toString()}
                                        </p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeInSet:
                            return (
                                <div key={index} className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute in set'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Set: '} {s.set.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            );
                        case StatementTypes.AttributeNotInSet:
                            return (
                                <div key={index} className="m-3 p-4 border rounded d-flex align-items-center">
                                    <img
                                        src="https://robohash.org/hicveldicta.png?size=50x50&set=set1"
                                        className="mr-2"
                                        alt="img"
                                    />
                                    <div className="">
                                        <p className="fw-bold mb-1">{'Attribute not in set'}</p>
                                        <p className="fw-normal mb-1">{s.attributeTag}</p>
                                        <p className="fw-normal mb-1">
                                            {' '}
                                            {'Set: '} {s.set.join(', ')}
                                        </p>
                                    </div>
                                </div>
                            );
                    }
                })}{' '}
            </div>{' '}
        </>
    ));
    if (newStatement) {
        return (
            <>
                {' '}
                {statements} <div className="alert alert-warning"> New credential statement started </div>{' '}
            </>
        );
    } else {
        return <> {statements} </>;
    }
}
