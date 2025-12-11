import { StatementTypes } from '@concordium/web-sdk';
import { TopLevelStatement, TopLevelStatements } from '../../types';

function Issuer({ outer_statement }: { outer_statement: TopLevelStatement }) {
    console.log("type is ", outer_statement.type);
    switch (outer_statement.type) {
        case 'id':
            if (outer_statement.statement.idCred_idps.length == 0) {
                return <div className="bg-danger"> No issuers selected for an identity credential statement. </div>;
            } else {
                return (
                    <div className="bg-info p-1">
                        <p> Statement about an identity credential </p>
                        <p> Allowed issuers </p>
                        <ul>
                            {outer_statement.statement.idCred_idps.map(({ name, id }) => {
                                return <li key={id}> {`${id}:${name}`} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
        case 'account':
            if (outer_statement.statement.idps.length == 0) {
                return <div className="bg-danger"> No issuers selected for an account statement. </div>;
            } else {
                return (
                    <div className="bg-info p-1">
                        <p> Statement about an account credential </p>
                        <p> Allowed issuers </p>
                        <ul>
                            {outer_statement.statement.idps.map(({ name, id }) => {
                                return <li> {`${id}:${name}`} </li>;
                            })}
                        </ul>
                    </div>
                );
            }
        case 'web3id':
            if (outer_statement.statement.issuers.length == 0) {
                return <div className="bg-danger"> No issuers selected for Web3Id credential statement. </div>;
            } else {
                return (
                    <div className="bg-success p-1">
                        <p> Statement about a Web3ID credential </p>
                        <p> Allowed issuers </p>

                        <ul className="bg-success">
                            {outer_statement.statement.issuers.map((inst) => {
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
export function Statement({ inner, new_statement }: { inner: TopLevelStatements; new_statement: boolean }) {
    const statements = inner.map((outer_statement) => (
        <>
            <Issuer outer_statement={outer_statement} />
            <div>
                {outer_statement.statement.statement.map((s,index) => {
                    console.log("statement type ", s.type);
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
    if (new_statement) {
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