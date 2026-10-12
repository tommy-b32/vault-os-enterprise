import {requireOperatorRole} from "@/lib/auth/operators";
import {SalesOrderCorrections} from "@/components/operations/SalesOrderCorrections";
export default async function SalesWorkbookCorrectionsPage(){await requireOperatorRole("owner","operator");return <main><h1>Sales order corrections</h1><SalesOrderCorrections/></main>}
