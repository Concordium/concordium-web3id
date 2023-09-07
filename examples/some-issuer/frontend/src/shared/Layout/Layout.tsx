import { PropsWithChildren } from 'react'
import reactLogo from 'assets/react.svg'
import viteLogo from '/vite.svg'
import './Layout.scss'

type Props = PropsWithChildren<{
  title: string;
}>;

function Layout({ title, children }: Props) {
  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>{title}</h1>
      <div className="card">
        {children}
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default Layout
