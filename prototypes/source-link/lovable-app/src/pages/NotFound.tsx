import { Link } from "react-router-dom"

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center">
    <p>
      Page not found. <Link to="/">Go home</Link>
    </p>
  </div>
)

export default NotFound
