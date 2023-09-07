import { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  logo: JSX.Element;
  platform: string;
}>;

function Main({ platform, children, logo }: Props) {
  return (
    <>
      <div className='layout__logo'>
        {logo}
      </div>
      <h1>{platform} web3 ID issuer</h1>
      <h4>Create your web3 ID credential for {platform} by logging in</h4>
      {children}
    </>
  )
}

export default Main
