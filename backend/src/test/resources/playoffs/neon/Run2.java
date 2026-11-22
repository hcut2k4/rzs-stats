import com.rzs.stats.playoffs.*;
import java.nio.file.*; import java.util.*;
public class Run2 {
  record P(int week,String home,String away){}
  public static void main(String[] a) throws Exception {
    var tot=new TreeMap<String,int[]>();
    for (var f: a) {
      var teams=new ArrayList<PlayoffSeeding.Team>(); var games=new ArrayList<PlayoffSeeding.Game>(); var po=new ArrayList<P>(); var snap=new HashMap<String,TreeMap<Integer,String>>(); var conf=new HashMap<String,String>();
      for (var l: Files.readAllLines(Path.of(f))) { var p=l.split(" ");
        switch(p[0]) { case "T"->{teams.add(new PlayoffSeeding.Team(p[1],p[2],p[3].replace('_',' '))); conf.put(p[1],p[2]);}
          case "G"->games.add(new PlayoffSeeding.Game(Integer.parseInt(p[1]),p[2],p[3],Integer.parseInt(p[4]),Integer.parseInt(p[5])));
          case "P"->po.add(new P(Integer.parseInt(p[1]),p[2],p[3]));
          case "S"->snap.computeIfAbsent(p[1],k->new TreeMap<>()).put(Integer.parseInt(p[2]),p[3]); } }
      var name=Path.of(f).getFileName().toString().replace(".txt","");
      var models=new LinkedHashMap<String,PlayoffSeeding.Result>();
      models.put("NFL",PlayoffSeeding.seed(teams,games)); models.put("Madden27",MaddenSeeding.madden27().seed(teams,games));
      for (var c: List.of("AFC","NFC")) {
        var sb=new StringBuilder(name+" "+c);
        String actualStr;
        if (!po.isEmpty()) {
          var wc=po.stream().filter(p->p.week()==18&&conf.get(p.home()).equals(c)).toList();
          var dv=po.stream().filter(p->p.week()==19&&conf.get(p.home()).equals(c)).toList();
          var inWc=new HashSet<String>(); wc.forEach(p->{inWc.add(p.home());inWc.add(p.away());});
          String bye=dv.stream().flatMap(p->java.util.stream.Stream.of(p.home(),p.away())).filter(t->!inWc.contains(t)).findFirst().orElse("?");
          var pairs=new TreeSet<String>(); wc.forEach(p->pairs.add(p.home()+"v"+p.away()));
          actualStr=" actual bye "+bye+" WC "+pairs;
          for (var m: models.entrySet()) {
            var s=seeds(m.getValue(),c);
            if (s.size()<7) { sb.append(" | ").append(m.getKey()).append(" UNRESOLVED"); tot.computeIfAbsent(m.getKey()+" bracket",k->new int[2])[1]++; continue; }
            var mp=new TreeSet<String>(List.of(s.get(1)+"v"+s.get(6),s.get(2)+"v"+s.get(5),s.get(3)+"v"+s.get(4)));
            boolean ok=s.get(0).equals(bye)&&mp.equals(pairs);
            var byeGame=dv.stream().filter(p->p.home().equals(bye)).findFirst();
            if (ok&&byeGame.isPresent()) { var rem=new ArrayList<String>(); dv.forEach(p->{rem.add(p.home());rem.add(p.away());}); rem.remove(bye);
              String lowest=rem.stream().max(Comparator.comparingInt(s::indexOf)).get(); ok=byeGame.get().away().equals(lowest); }
            var t=tot.computeIfAbsent(m.getKey()+" bracket",k->new int[2]); if(ok) t[0]++; t[1]++;
            sb.append(" | ").append(m.getKey()).append(ok?" OK ":" X  ").append(s);
          }
        } else {
          var act=new ArrayList<>(snap.get(c).values()); actualStr=" madden "+act;
          for (var m: models.entrySet()) {
            var s=fullOrder(m.getValue(),c); int pos=0; for(int i=0;i<Math.min(s.size(),16);i++) if(s.get(i).equals(act.get(i))) pos++;
            boolean top7=s.size()>=7&&s.subList(0,7).equals(act.subList(0,7));
            var t=tot.computeIfAbsent(m.getKey()+" snapshot top7",k->new int[2]); if(top7)t[0]++; t[1]++;
            var t2=tot.computeIfAbsent(m.getKey()+" snapshot full16",k->new int[2]); if(pos==16)t2[0]++; t2[1]++;
            sb.append(" | ").append(m.getKey()).append(top7?" top7OK ":" top7X  ").append(pos).append("/16 ").append(s);
          }
        }
        System.out.println(sb+"\n      "+actualStr);
      }
    }
    System.out.println("\nTOTALS"); tot.forEach((k,v)->System.out.println("  "+k+": "+v[0]+"/"+v[1]));
  }
  static List<String> fullOrder(PlayoffSeeding.Result r,String c){ var out=new ArrayList<String>(); var ranks=r.conferences().get(c); if(ranks==null) return out; for (var k: ranks) out.addAll(k.teams()); return out; }
  static List<String> seeds(PlayoffSeeding.Result r,String c){ var o=fullOrder(r,c); return o.subList(0,Math.min(7,o.size())); }
}
