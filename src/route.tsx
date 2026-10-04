import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router'
import { PublicCatalogProvider } from '@/hooks/usePublicCatalog'
import Home from '@/pages/Home'

const About = lazy(() => import('@/pages/About'))
const Admin = lazy(() => import('@/pages/Admin'))
const Submit = lazy(() => import('@/pages/Submit'))

function PageLoader() {
	return (
		<output aria-label="页面加载中" aria-live="polite">
			<div
				className="fixed top-0 left-0 right-0 z-100 h-0.5 bg-primary/20"
				aria-hidden="true"
			>
				<div
					className="h-full bg-primary animate-pulse"
					style={{ width: '60%' }}
				/>
			</div>

			<div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 space-y-3">
				{/* 分类栏骨架 */}
				<div className="flex gap-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
							key={i}
							className="h-6 w-16 rounded-full bg-muted animate-pulse"
						/>
					))}
				</div>

				{/* 卡片网格骨架 */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
							key={i}
							className="card p-4 h-28 flex flex-col gap-3"
							aria-hidden="true"
						>
							<div className="flex items-start gap-3">
								<div className="h-9 w-9 shrink-0 rounded-lg bg-muted animate-pulse" />
								<div className="flex-1 pt-1">
									<div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
								</div>
							</div>
							<div className="flex flex-col gap-1.5">
								<div className="h-3 w-full rounded bg-muted animate-pulse" />
								<div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
							</div>
						</div>
					))}
				</div>
			</div>
		</output>
	)
}

import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

function ErrorPage() {
	const error = useRouteError()
	const is404 = isRouteErrorResponse(error) && error.status === 404

	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-background"
			aria-label="错误页面"
		>
			<h1 className="text-2xl font-bold text-foreground mb-2">
				{is404 ? '页面未找到' : '出现了一些问题'}
			</h1>

			<p className="text-muted-foreground mb-6 max-w-sm">
				{is404
					? '你访问的页面不存在，可能已被移除或链接有误'
					: '应用发生了未知错误，请刷新页面重试'}
			</p>

			{import.meta.env.DEV && !is404 && (
				<pre className="mb-6 p-4 rounded-lg bg-muted text-left text-xs text-muted-foreground max-w-md overflow-auto">
					{error instanceof Error
						? error.message
						: JSON.stringify(error, null, 2)}
				</pre>
			)}

			<Link
				to="/"
				className="
          inline-flex items-center gap-2
          px-4 py-2 rounded-lg
          bg-primary text-primary-foreground
          text-sm font-medium
          hover:opacity-90 active:opacity-80
          transition-opacity duration-100
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-primary focus-visible:ring-offset-2
          no-underline
        "
			>
				返回首页
			</Link>
		</main>
	)
}

function RootLayout() {
	return (
		<PublicCatalogProvider>
			<div className="bg-background">
				<Suspense fallback={<PageLoader />}>
					<Outlet />
				</Suspense>
				<ScrollRestoration />
			</div>
		</PublicCatalogProvider>
	)
}

export const router = createBrowserRouter([
	{
		path: '/',
		element: <RootLayout />,
		errorElement: <ErrorPage />,
		children: [
			{
				index: true,
				element: <Home />,
			},
			{
				path: 'about',
				element: <About />,
			},
			{ path: 'admin', element: <Admin /> },
			{ path: 'submit', element: <Submit /> },
		],
	},
])
