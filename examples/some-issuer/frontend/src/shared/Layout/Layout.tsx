import { PropsWithChildren } from 'react';
import ccdLogo from 'assets/ccd-logo.svg';

type Props = PropsWithChildren<{
    logo: JSX.Element;
    platform: string;
}>;

function Layout({ platform, children, logo }: Props) {
    return (
        <main className="layout">
            <div className="d-inline-flex align-items-center">
                <div className="layout__logo">
                    <img src={ccdLogo} alt="Concordium logo" />
                </div>
                <div className="layout__plus">+</div>
                <div className="layout__logo">{logo}</div>
            </div>
            <h1>{platform} web3 ID issuer</h1>
            <h4 className="mb-4">Create your web3 ID credential for {platform} by logging in</h4>
            {children}
        </main>
    );
}

export default Layout;
