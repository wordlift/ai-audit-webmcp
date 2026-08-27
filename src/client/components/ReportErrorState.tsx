import { CircleAlert } from "lucide-react";
import { Link } from "react-router-dom";

export function ReportErrorState({ title, message }: { title: string; message: string }) {
  return <section className="report-error"><CircleAlert /><h1>{title}</h1><p>{message}</p><Link to="/">Try another website</Link></section>;
}
