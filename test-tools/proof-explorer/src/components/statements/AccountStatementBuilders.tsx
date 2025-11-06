import { useState, MouseEventHandler, ChangeEventHandler } from 'react';
import {
    AttributeKeyString,
    IdentityStatementBuilder,
} from '@concordium/web-sdk';
import { AgeBoundProps, ExtendSetStatementProps, ExtendStatementProps, SpecialSetProps } from '../../types';

//Statements about ID, represeting the middle row in the UI
export function AgeBound({ younger, setStatement }: AgeBoundProps) {
    const [bound, setBound] = useState<string>('18');

    const onBoundChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setBound(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        // since addMaximumage and addMinimumAge do some arithmetic with the
        // bound we have to parse it to avoid weird behaviour that results from
        // adding and subtracting numbers and strings
        if (younger) {
            builder.addMaximumAge(parseInt(bound));
        } else {
            builder.addMinimumAge(parseInt(bound));
        }
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove${younger ? ' younger ' : ' older '}than`} </label> <br />
                <input className="my-1" onChange={onBoundChange} value={bound} />
                <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

export function AgeInRange({ setStatement }: ExtendStatementProps) {
    const [lower, setLower] = useState<string>('18');
    const [upper, setUpper] = useState<string>('64');

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower(e.target.value);
    };

    const onUpperChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setUpper(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        // Since addAgeInRange does some arithmetic we need to parse inputs as integers
        // first. Otherwise we get unexpected behaviour.
        builder.addAgeInRange(parseInt(lower), parseInt(upper));
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove age in range'} </label> <br />
                {'Lower age: '}
                <input className="my-1" onChange={onLowerChange} value={lower} />
                <br />
                {'Upper age: '}
                <input className="my-1" onChange={onUpperChange} value={upper} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

export function DocumentExpiryNoEarlier({ setStatement }: ExtendStatementProps) {
    const [lower, setLower] = useState<string>('20250505');

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        builder.documentExpiryNoEarlierThan(lower);
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove doc expiry no earlier than'} </label> <br />
                <input className="my-1" onChange={onLowerChange} value={lower} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

export function DocumentIssuerIn({ setStatement }: ExtendStatementProps) {
    const [set, setSet] = useState<string>('');

    const onSetChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        builder.addMembership(
            AttributeKeyString.idDocIssuer,
            set.split(',').map((e) => e.trim())
        );
        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove document issuer in'} </label> <br />
                <input className="my-1" onChange={onSetChange} value={set} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

/*
Used for:
- Prove nationality in/not in
- Prove countryOfResidence in/not in
 */
export function AttributeIn({ attribute, member, setStatement }: ExtendSetStatementProps) {
    const [set, setSet] = useState<string>('');

    const onSetChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        if (member) {
            builder.addMembership(
                attribute,
                set.split(',').map((e) => e.trim())
            );
        } else {
            builder.addNonMembership(
                attribute,
                set.split(',').map((e) => e.trim())
            );
        }

        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove ${attribute}${member ? ' ' : ' not '}in`} </label> <br />
                <input className="my-1" onChange={onSetChange} value={set} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

export function EUAttributeIn({ nationality, setStatement }: SpecialSetProps) {
    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        const builder = new IdentityStatementBuilder();
        if (nationality) {
            builder.addEUNationality();
        } else {
            builder.addEUResidency();
        }

        setStatement(builder.getStatement());
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove ${nationality ? 'nationality in EU' : 'residence in EU'}`} </label> <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}