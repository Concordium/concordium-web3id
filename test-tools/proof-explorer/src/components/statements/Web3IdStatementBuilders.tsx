import { useState, MouseEventHandler, ChangeEventHandler } from 'react';
import Select from 'react-select';
import {
    StatementTypes,
    TimestampAttribute,
} from '@concordium/web-sdk';
import { RevealAttributeProps, SetMembershipProps } from '../../types';

// These components represent web3ID, the left column in the UI
export function RevealAttribute({ setStatement, attributeOptions }: RevealAttributeProps) {
    const [selected, setSelected] = useState<string>(attributeOptions[0].label);

    const handleChange = (option: { value: string; label: string } | null) => {
        if (option === null) {
            return;
        }
        setSelected(option.label);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: StatementTypes.RevealAttribute,
                attributeTag: selected,
            },
        ]);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary p-1">
                <label>{'Reveal attribute.'} </label>
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                <div>
                    {' '}
                    <button onClick={onClickAdd} type="button" className="btn btn-primary">
                        {'Add'}
                    </button>{' '}
                </div>
            </div>
        </form>
    );
}

export function AttributeInRange({ setStatement, attributeOptions }: RevealAttributeProps) {
    const [lower, setLower] = useState<[string, string | undefined]>(['', undefined]);
    const [upper, setUpper] = useState<[string, string | undefined]>(['', undefined]);

    const [selected, setSelected] = useState<[string, string | undefined]>([
        attributeOptions[0].value,
        attributeOptions[0].label,
    ]);

    const handleChange = (option: { value: string; label: string; type: string | undefined } | null) => {
        if (option === null) {
            return;
        }
        setSelected([option.label, option.type]);
    };

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        let lower_bound: string | bigint | TimestampAttribute = lower[0];
        if (lower[1] === 'number' || lower[1] === 'integer') {
            lower_bound = BigInt(lower[0]);
        } else if (lower[1] == 'date-time') {
            lower_bound = {
                type: 'date-time',
                timestamp: lower[0],
            };
        }
        let upper_bound: string | bigint | TimestampAttribute = upper[0];
        if (upper[1] === 'number' || upper[1] === 'integer') {
            upper_bound = BigInt(upper[0]);
        } else if (upper[1] == 'date-time') {
            upper_bound = {
                type: 'date-time',
                timestamp: upper[0],
            };
        }
        setStatement([
            {
                type: StatementTypes.AttributeInRange,
                attributeTag: selected[0],
                lower: lower_bound,
                upper: upper_bound,
            },
        ]);
    };

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setLower([e.target.value, selected[1]]);
    };

    const onUpperChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setUpper([e.target.value, selected[1]]);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{'Prove attribute in range'} </label> <br />
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                {'Lower bound: '}
                <input className="my-1" onChange={onLowerChange} value={lower[0]} />
                <br />
                {'Upper bound: '}
                <input className="my-1" onChange={onUpperChange} value={upper[0]} />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}

export function AttributeInSet({ member, setStatement, attributeOptions }: SetMembershipProps) {
    const [set, setSet] = useState<string>('');

    const [selected, setSelected] = useState<[string, string | undefined]>([
        attributeOptions[0].value,
        attributeOptions[0].type,
    ]);

    const handleChange = (option: { value: string; label: string; type: string | undefined } | null) => {
        if (option === null) {
            return;
        }
        setSelected([option.label, option.type]);
    };

    let proof_set: string[] | bigint[] | TimestampAttribute[] = set.split(',').map((s) => s.trim());
    if (selected[1] === 'number' || selected[1] === 'integer') {
        proof_set = proof_set.map((x) => BigInt(x));
    } else if (selected[1] == 'date-time') {
        proof_set = proof_set.map((x) => {
            return {
                type: 'date-time',
                timestamp: x.trim(),
            };
        });
    }

    const onClickAdd: MouseEventHandler<HTMLButtonElement> = () => {
        setStatement([
            {
                type: member ? StatementTypes.AttributeInSet : StatementTypes.AttributeNotInSet,
                attributeTag: selected[0],
                set: proof_set,
            },
        ]);
    };

    const onLowerChange: ChangeEventHandler<HTMLInputElement> = (e) => {
        setSet(e.target.value);
    };

    return (
        <form>
            <div className="form-group border rounded border-primary my-2 p-1">
                <label>{`Prove attribute${member ? ' ' : ' not '} in set`} </label> <br />
                <Select
                    className="rounded my-1"
                    onChange={handleChange}
                    options={attributeOptions}
                    defaultValue={attributeOptions[0]}
                />
                {'Set: '}
                <input className="my-1" onChange={onLowerChange} value={set} />
                <br />
                <button onClick={onClickAdd} type="button" className="btn btn-primary">
                    {'Add'}
                </button>
            </div>
        </form>
    );
}
